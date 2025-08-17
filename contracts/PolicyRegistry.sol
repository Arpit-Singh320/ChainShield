// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PolicyRegistry
 * @dev Stores insurance policies and manages their lifecycle
 */
contract PolicyRegistry {
    struct Policy {
        uint256 policyId;
        address policyholder;
        uint256 premium;
        uint256 coverage;
        uint256 deductible;
        string policyType; // "auto", "home", "health", "travel"
        uint256 startDate;
        uint256 endDate;
        bool isActive;
        uint256 claimsCount;
        uint256 totalPayouts;
    }
    
    mapping(uint256 => Policy) public policies;
    mapping(address => uint256[]) public userPolicies;
    
    uint256 public nextPolicyId = 1;
    address public admin;
    address public claimsProcessor;
    
    event PolicyCreated(uint256 indexed policyId, address indexed policyholder);
    event PolicyUpdated(uint256 indexed policyId);
    event PolicyCancelled(uint256 indexed policyId);
    event ClaimCountUpdated(uint256 indexed policyId, uint256 newCount);
    event PayoutRecorded(uint256 indexed policyId, uint256 amount);
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    modifier onlyClaimsProcessor() {
        require(msg.sender == claimsProcessor, "Only claims processor");
        _;
    }
    
    constructor() {
        admin = msg.sender;
    }
    
    /**
     * @dev Sets the address of the claims processor contract
     * @param _claimsProcessor Address of the claims processor contract
     */
    function setClaimsProcessor(address _claimsProcessor) external onlyAdmin {
        claimsProcessor = _claimsProcessor;
    }
    
    /**
     * @dev Creates a new insurance policy
     * @param _policyholder Address of the policyholder
     * @param _premium Premium amount in wei
     * @param _coverage Coverage amount in wei
     * @param _deductible Deductible amount in wei
     * @param _policyType Type of policy (auto, home, health, travel)
     * @param _duration Duration of the policy in seconds
     * @return policyId Unique identifier of the created policy
     */
    function createPolicy(
        address _policyholder,
        uint256 _premium,
        uint256 _coverage,
        uint256 _deductible,
        string memory _policyType,
        uint256 _duration
    ) external onlyAdmin returns (uint256) {
        uint256 policyId = nextPolicyId++;
        
        policies[policyId] = Policy({
            policyId: policyId,
            policyholder: _policyholder,
            premium: _premium,
            coverage: _coverage,
            deductible: _deductible,
            policyType: _policyType,
            startDate: block.timestamp,
            endDate: block.timestamp + _duration,
            isActive: true,
            claimsCount: 0,
            totalPayouts: 0
        });
        
        userPolicies[_policyholder].push(policyId);
        emit PolicyCreated(policyId, _policyholder);
        return policyId;
    }
    
    /**
     * @dev Updates an existing policy
     * @param _policyId ID of the policy to update
     * @param _premium New premium amount
     * @param _coverage New coverage amount
     * @param _deductible New deductible amount
     * @param _duration Additional duration in seconds
     */
    function updatePolicy(
        uint256 _policyId,
        uint256 _premium,
        uint256 _coverage,
        uint256 _deductible,
        uint256 _duration
    ) external onlyAdmin {
        require(policies[_policyId].policyId == _policyId, "Policy does not exist");
        require(policies[_policyId].isActive, "Policy is not active");
        
        Policy storage policy = policies[_policyId];
        policy.premium = _premium;
        policy.coverage = _coverage;
        policy.deductible = _deductible;
        
        if (_duration > 0) {
            policy.endDate += _duration;
        }
        
        emit PolicyUpdated(_policyId);
    }
    
    /**
     * @dev Cancels an existing policy
     * @param _policyId ID of the policy to cancel
     */
    function cancelPolicy(uint256 _policyId) external onlyAdmin {
        require(policies[_policyId].policyId == _policyId, "Policy does not exist");
        require(policies[_policyId].isActive, "Policy is already inactive");
        
        policies[_policyId].isActive = false;
        emit PolicyCancelled(_policyId);
    }
    
    /**
     * @dev Increments the claim count for a policy
     * @param _policyId ID of the policy
     */
    function incrementClaimCount(uint256 _policyId) external onlyClaimsProcessor {
        require(policies[_policyId].policyId == _policyId, "Policy does not exist");
        require(policies[_policyId].isActive, "Policy is not active");
        
        policies[_policyId].claimsCount += 1;
        emit ClaimCountUpdated(_policyId, policies[_policyId].claimsCount);
    }
    
    /**
     * @dev Records a payout for a policy
     * @param _policyId ID of the policy
     * @param _amount Payout amount
     */
    function recordPayout(uint256 _policyId, uint256 _amount) external onlyClaimsProcessor {
        require(policies[_policyId].policyId == _policyId, "Policy does not exist");
        require(policies[_policyId].isActive, "Policy is not active");
        
        policies[_policyId].totalPayouts += _amount;
        emit PayoutRecorded(_policyId, _amount);
    }
    
    /**
     * @dev Checks if a policy is valid for making claims
     * @param _policyId ID of the policy
     * @param _claimant Address of the claimant
     * @return bool True if the policy is valid for claims
     */
    function isPolicyValidForClaims(uint256 _policyId, address _claimant) external view returns (bool) {
        Policy storage policy = policies[_policyId];
        
        return (
            policy.policyId == _policyId &&
            policy.policyholder == _claimant &&
            policy.isActive &&
            block.timestamp >= policy.startDate &&
            block.timestamp <= policy.endDate
        );
    }
    
    /**
     * @dev Gets all policies owned by a user
     * @param _user Address of the user
     * @return uint256[] Array of policy IDs owned by the user
     */
    function getUserPolicies(address _user) external view returns (uint256[] memory) {
        return userPolicies[_user];
    }
    
    /**
     * @dev Gets policy details by ID
     * @param _policyId ID of the policy
     * @return Policy details of the specified policy
     */
    function getPolicy(uint256 _policyId) external view returns (Policy memory) {
        return policies[_policyId];
    }
}
