// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "./PolicyRegistry.sol";
import "./PayoutManager.sol";

/**
 * @title ClaimsProcessor
 * @dev Handles claim submissions, AI analysis, and reviewer selection using Chainlink VRF
 */
contract ClaimsProcessor is VRFConsumerBaseV2 {
    struct Claim {
        uint256 claimId;
        uint256 policyId;
        address claimant;
        string description;
        string[] evidenceHashes; // IPFS hashes
        uint256 timestamp;
        ClaimStatus status;
        
        // AI Analysis Results
        uint8 claimType; // 0-auto, 1-home, 2-health, 3-travel
        uint8 severity; // 1-10 scale
        uint8 fraudRisk; // 0-100 percentage
        uint256 recommendedPayout;
        
        uint256 finalPayout;
        uint256 processedAt;
        bool requiresHumanReview;
        address assignedReviewer;
    }
    
    enum ClaimStatus {
        Submitted,
        AIAnalyzed,
        UnderReview,
        Approved,
        Rejected,
        Paid
    }
    
    mapping(uint256 => Claim) public claims;
    mapping(uint256 => uint256) public vrfRequestToClaim; // VRF request ID to claim ID
    mapping(address => bool) public reviewers; // Registered human reviewers
    address[] public activeReviewers; // List of active reviewers
    
    uint256 public nextClaimId = 1;
    VRFCoordinatorV2Interface public vrfCoordinator;
    uint64 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint32 public vrfCallbackGasLimit = 200000;
    uint16 public vrfRequestConfirmations = 3;
    uint32 public numWords = 1;
    
    address public policyRegistry;
    address payable public payoutManager;
    address public aiOracle; // Address authorized to submit AI analysis
    address public admin;
    
    // Thresholds
    uint8 public autoApproveThreshold = 20; // Auto-approve if fraudRisk < 20
    uint8 public autoRejectThreshold = 70; // Auto-reject if fraudRisk > 70
    
    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, address indexed claimant);
    event AIAnalysisReceived(uint256 indexed claimId);
    event ReviewerAssigned(uint256 indexed claimId, address indexed reviewer);
    event ClaimApproved(uint256 indexed claimId, uint256 payout);
    event ClaimRejected(uint256 indexed claimId, string reason);
    event ClaimPaid(uint256 indexed claimId);
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    modifier onlyAIOracle() {
        require(msg.sender == aiOracle, "Only AI oracle");
        _;
    }
    
    modifier onlyReviewer() {
        require(reviewers[msg.sender], "Only reviewer");
        _;
    }
    
    /**
     * @dev Constructor for the ClaimsProcessor contract
     * @param _vrfCoordinator Address of the VRF Coordinator
     * @param _keyHash KeyHash for VRF
     * @param _subscriptionId VRF subscription ID
     * @param _policyRegistry Address of the PolicyRegistry contract
     */
    constructor(
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint64 _subscriptionId,
        address _policyRegistry
    ) VRFConsumerBaseV2(_vrfCoordinator) {
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        vrfKeyHash = _keyHash;
        vrfSubscriptionId = _subscriptionId;
        policyRegistry = _policyRegistry;
        admin = msg.sender;
        aiOracle = msg.sender; // Initially admin is the AI oracle too
    }
    
    /**
     * @dev Sets the payout manager address
     * @param _payoutManager Address of the PayoutManager contract
     */
    function setPayoutManager(address _payoutManager) external onlyAdmin {
        payoutManager = payable(_payoutManager);
    }
    
    /**
     * @dev Sets the AI Oracle address
     * @param _aiOracle Address of the AI Oracle
     */
    function setAIOracle(address _aiOracle) external onlyAdmin {
        aiOracle = _aiOracle;
    }
    
    /**
     * @dev Adds a reviewer to the system
     * @param _reviewer Address of the reviewer
     */
    function addReviewer(address _reviewer) external onlyAdmin {
        require(!reviewers[_reviewer], "Already a reviewer");
        reviewers[_reviewer] = true;
        activeReviewers.push(_reviewer);
    }
    
    /**
     * @dev Removes a reviewer from the system
     * @param _reviewer Address of the reviewer
     */
    function removeReviewer(address _reviewer) external onlyAdmin {
        require(reviewers[_reviewer], "Not a reviewer");
        reviewers[_reviewer] = false;
        
        // Remove from activeReviewers array
        for (uint i = 0; i < activeReviewers.length; i++) {
            if (activeReviewers[i] == _reviewer) {
                // Replace with last element and pop
                activeReviewers[i] = activeReviewers[activeReviewers.length - 1];
                activeReviewers.pop();
                break;
            }
        }
    }
    
    /**
     * @dev Sets the auto-approve and auto-reject thresholds
     * @param _autoApprove Auto-approve threshold
     * @param _autoReject Auto-reject threshold
     */
    function setThresholds(uint8 _autoApprove, uint8 _autoReject) external onlyAdmin {
        require(_autoApprove < _autoReject, "Invalid thresholds");
        autoApproveThreshold = _autoApprove;
        autoRejectThreshold = _autoReject;
    }
    
    /**
     * @dev Submits a new insurance claim
     * @param _policyId ID of the policy
     * @param _description Description of the claim
     * @param _evidenceHashes IPFS hashes of the evidence files
     * @return claimId ID of the submitted claim
     */
    function submitClaim(
        uint256 _policyId,
        string memory _description,
        string[] memory _evidenceHashes
    ) external returns (uint256) {
        // Verify policy validity
        require(
            PolicyRegistry(policyRegistry).isPolicyValidForClaims(_policyId, msg.sender),
            "Invalid policy"
        );
        
        uint256 claimId = nextClaimId++;
        
        claims[claimId] = Claim({
            claimId: claimId,
            policyId: _policyId,
            claimant: msg.sender,
            description: _description,
            evidenceHashes: _evidenceHashes,
            timestamp: block.timestamp,
            status: ClaimStatus.Submitted,
            claimType: 0,
            severity: 0,
            fraudRisk: 0,
            recommendedPayout: 0,
            finalPayout: 0,
            processedAt: 0,
            requiresHumanReview: false,
            assignedReviewer: address(0)
        });
        
        // Increment claim count in policy
        PolicyRegistry(policyRegistry).incrementClaimCount(_policyId);
        
        emit ClaimSubmitted(claimId, _policyId, msg.sender);
        return claimId;
    }
    
    /**
     * @dev Submits AI analysis results for a claim
     * @param _claimId ID of the claim
     * @param _claimType Type of claim (0-3)
     * @param _severity Severity of the claim (1-10)
     * @param _fraudRisk Fraud risk percentage (0-100)
     * @param _recommendedPayout Recommended payout amount
     */
    function submitAIAnalysis(
        uint256 _claimId,
        uint8 _claimType,
        uint8 _severity,
        uint8 _fraudRisk,
        uint256 _recommendedPayout
    ) external onlyAIOracle {
        require(claims[_claimId].status == ClaimStatus.Submitted, "Invalid status");
        
        Claim storage claim = claims[_claimId];
        claim.claimType = _claimType;
        claim.severity = _severity;
        claim.fraudRisk = _fraudRisk;
        claim.recommendedPayout = _recommendedPayout;
        claim.status = ClaimStatus.AIAnalyzed;
        
        // Auto-approve low-risk claims under threshold
        if (_fraudRisk < autoApproveThreshold && _recommendedPayout > 0) {
            _approveClaim(_claimId, _recommendedPayout);
        } 
        // Auto-reject high-risk claims
        else if (_fraudRisk > autoRejectThreshold) {
            claim.status = ClaimStatus.Rejected;
            claim.processedAt = block.timestamp;
            emit ClaimRejected(_claimId, "High fraud risk detected");
        } 
        // Send to human review with VRF for fair selection
        else {
            claim.requiresHumanReview = true;
            _requestRandomReviewer(_claimId);
        }
        
        emit AIAnalysisReceived(_claimId);
    }
    
    /**
     * @dev Reviewer approves a claim
     * @param _claimId ID of the claim
     * @param _payout Approved payout amount
     */
    function reviewerApproveClaim(uint256 _claimId, uint256 _payout) external onlyReviewer {
        Claim storage claim = claims[_claimId];
        require(claim.status == ClaimStatus.UnderReview, "Invalid status");
        require(claim.assignedReviewer == msg.sender, "Not assigned reviewer");
        
        _approveClaim(_claimId, _payout);
    }
    
    /**
     * @dev Reviewer rejects a claim
     * @param _claimId ID of the claim
     * @param _reason Reason for rejection
     */
    function reviewerRejectClaim(uint256 _claimId, string memory _reason) external onlyReviewer {
        Claim storage claim = claims[_claimId];
        require(claim.status == ClaimStatus.UnderReview, "Invalid status");
        require(claim.assignedReviewer == msg.sender, "Not assigned reviewer");
        
        claim.status = ClaimStatus.Rejected;
        claim.processedAt = block.timestamp;
        emit ClaimRejected(_claimId, _reason);
    }
    
    /**
     * @dev Internal function to approve a claim
     * @param _claimId ID of the claim
     * @param _payout Approved payout amount
     */
    function _approveClaim(uint256 _claimId, uint256 _payout) internal {
        Claim storage claim = claims[_claimId];
        claim.status = ClaimStatus.Approved;
        claim.finalPayout = _payout;
        claim.processedAt = block.timestamp;
        
        emit ClaimApproved(_claimId, _payout);
        
        // Process payout if PayoutManager is set
        if (payoutManager != address(0)) {
            PayoutManager(payoutManager).processPayout(_claimId, claim.claimant, _payout);
            
            // Record payout in the policy
            PolicyRegistry(policyRegistry).recordPayout(claim.policyId, _payout);
            
            claim.status = ClaimStatus.Paid;
            emit ClaimPaid(_claimId);
        }
    }
    
    /**
     * @dev Requests a random reviewer using Chainlink VRF
     * @param _claimId ID of the claim
     */
    function _requestRandomReviewer(uint256 _claimId) internal {
        require(activeReviewers.length > 0, "No active reviewers");
        
        claims[_claimId].status = ClaimStatus.UnderReview;
        
        uint256 requestId = vrfCoordinator.requestRandomWords(
            vrfKeyHash,
            vrfSubscriptionId,
            vrfRequestConfirmations,
            vrfCallbackGasLimit,
            numWords
        );
        
        vrfRequestToClaim[requestId] = _claimId;
    }
    
    /**
     * @dev Callback function used by VRF Coordinator
     * @param requestId ID of the VRF request
     * @param randomWords Random words returned by VRF
     */
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        uint256 claimId = vrfRequestToClaim[requestId];
        require(claimId > 0, "Claim not found");
        
        // Ensure we have active reviewers
        if (activeReviewers.length == 0) {
            // If no reviewers, admin handles the claim
            claims[claimId].assignedReviewer = admin;
            emit ReviewerAssigned(claimId, admin);
            return;
        }
        
        uint256 reviewerIndex = randomWords[0] % activeReviewers.length;
        address selectedReviewer = activeReviewers[reviewerIndex];
        
        // Assign to reviewer
        claims[claimId].assignedReviewer = selectedReviewer;
        emit ReviewerAssigned(claimId, selectedReviewer);
    }
    
    /**
     * @dev Gets all claims submitted by a user
     * @param _user Address of the user
     * @return claimIds Array of claim IDs
     */
    function getUserClaims(address _user) external view returns (uint256[] memory) {
        uint256 count = 0;
        
        // First count the number of claims for this user
        for (uint256 i = 1; i < nextClaimId; i++) {
            if (claims[i].claimant == _user) {
                count++;
            }
        }
        
        uint256[] memory claimIds = new uint256[](count);
        uint256 index = 0;
        
        // Fill the array with claim IDs
        for (uint256 i = 1; i < nextClaimId; i++) {
            if (claims[i].claimant == _user) {
                claimIds[index] = i;
                index++;
            }
        }
        
        return claimIds;
    }
    
    /**
     * @dev Gets claims that require human review
     * @return claimIds Array of claim IDs
     */
    function getClaimsForReview() external view onlyReviewer returns (uint256[] memory) {
        uint256 count = 0;
        
        // First count the number of claims for review
        for (uint256 i = 1; i < nextClaimId; i++) {
            if (claims[i].status == ClaimStatus.UnderReview && 
                claims[i].assignedReviewer == msg.sender) {
                count++;
            }
        }
        
        uint256[] memory claimIds = new uint256[](count);
        uint256 index = 0;
        
        // Fill the array with claim IDs
        for (uint256 i = 1; i < nextClaimId; i++) {
            if (claims[i].status == ClaimStatus.UnderReview && 
                claims[i].assignedReviewer == msg.sender) {
                claimIds[index] = i;
                index++;
            }
        }
        
        return claimIds;
    }
    
    /**
     * @dev Gets the claim details
     * @param _claimId ID of the claim
     * @return Claim details
     */
    function getClaim(uint256 _claimId) external view returns (Claim memory) {
        return claims[_claimId];
    }
    
    /**
     * @dev Gets the number of active reviewers
     * @return uint256 Number of active reviewers
     */
    function getActiveReviewerCount() public view returns (uint256) {
        return activeReviewers.length;
    }
}
