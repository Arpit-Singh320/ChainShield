// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./ClaimsProcessor.sol";

/**
 * @title PayoutManager
 * @dev Manages payouts for approved insurance claims
 */
contract PayoutManager {
    struct Payout {
        uint256 claimId;
        address recipient;
        uint256 usdAmount;
        uint256 avaxAmount;
        uint256 timestamp;
        bool processed;
        bool withdrawn;
    }
    
    mapping(uint256 => Payout) public payouts;
    mapping(address => uint256) public balances;
    
    address public claimsProcessor;
    address public admin;
    address public treasury;
    AggregatorV3Interface public priceFeed; // For USD/AVAX conversion
    
    uint256 public totalPayouts;
    uint256 public totalWithdrawn;
    uint256 public availableFunds;
    
    event PayoutProcessed(uint256 indexed claimId, address indexed recipient, uint256 usdAmount, uint256 avaxAmount);
    event FundsDeposited(address indexed depositor, uint256 amount);
    event FundsWithdrawn(address indexed recipient, uint256 amount);
    
    modifier onlyClaimsProcessor() {
        require(msg.sender == claimsProcessor, "Only claims processor");
        _;
    }
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    /**
     * @dev Constructor for PayoutManager
     * @param _claimsProcessor Address of the ClaimsProcessor contract
     * @param _priceFeed Address of the Chainlink Price Feed for AVAX/USD
     */
    constructor(address _claimsProcessor, address _priceFeed) {
        claimsProcessor = _claimsProcessor;
        priceFeed = AggregatorV3Interface(_priceFeed);
        admin = msg.sender;
        treasury = msg.sender;
    }
    
    /**
     * @dev Sets the treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyAdmin {
        treasury = _treasury;
    }
    
    /**
     * @dev Updates the price feed address
     * @param _priceFeed New price feed address
     */
    function setPriceFeed(address _priceFeed) external onlyAdmin {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }
    
    /**
     * @dev Process payout for an approved claim
     * @param _claimId ID of the approved claim
     * @param _recipient Address of the claim recipient
     * @param _usdAmount Payout amount in USD (with 6 decimals, e.g., 1000000 = 1 USD)
     */
    function processPayout(uint256 _claimId, address _recipient, uint256 _usdAmount) external onlyClaimsProcessor {
        require(payouts[_claimId].claimId == 0, "Payout already processed");
        require(_usdAmount > 0, "Amount must be positive");
        
        // Convert USD to AVAX using Chainlink price feed
        uint256 avaxAmount = convertUSDToAVAX(_usdAmount);
        
        // Check if contract has enough funds for payout
        require(availableFunds >= avaxAmount, "Insufficient funds");
        
        payouts[_claimId] = Payout({
            claimId: _claimId,
            recipient: _recipient,
            usdAmount: _usdAmount,
            avaxAmount: avaxAmount,
            timestamp: block.timestamp,
            processed: true,
            withdrawn: false
        });
        
        // Add to user's balance
        balances[_recipient] += avaxAmount;
        availableFunds -= avaxAmount;
        totalPayouts += avaxAmount;
        
        emit PayoutProcessed(_claimId, _recipient, _usdAmount, avaxAmount);
    }
    
    /**
     * @dev Convert USD amount to AVAX using Chainlink price feed
     * @param _usdAmount Amount in USD (with 6 decimals)
     * @return avaxAmount Equivalent amount in AVAX (with 18 decimals)
     */
    function convertUSDToAVAX(uint256 _usdAmount) public view returns (uint256) {
        // Get latest price from Chainlink (AVAX/USD)
        (, int256 price, , ,) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price data");
        
        // Convert price to positive uint256, chainlink returns price with 8 decimals
        uint256 avaxUsdPrice = uint256(price);
        
        // USD amount has 6 decimals, price has 8 decimals, AVAX has 18 decimals
        // (_usdAmount * 10^18) / (avaxUsdPrice * 10^10)
        // This gives the amount in AVAX with 18 decimals
        uint256 avaxAmount = (_usdAmount * 1e18) / (avaxUsdPrice * 1e2);
        
        return avaxAmount;
    }
    
    /**
     * @dev Allow users to withdraw their balance
     */
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance to withdraw");
        
        // Reset balance before transfer to prevent reentrancy
        balances[msg.sender] = 0;
        
        // Transfer AVAX
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        
        totalWithdrawn += amount;
        
        emit FundsWithdrawn(msg.sender, amount);
    }
    
    /**
     * @dev Deposit funds to the contract
     */
    receive() external payable {
        availableFunds += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }
    
    /**
     * @dev Allows admin to deposit funds
     */
    function deposit() external payable {
        availableFunds += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }
    
    /**
     * @dev Allows admin to withdraw excess funds to treasury
     * @param _amount Amount to withdraw
     */
    function withdrawToTreasury(uint256 _amount) external onlyAdmin {
        require(_amount <= address(this).balance - totalPayouts + totalWithdrawn, "Exceeds available funds");
        
        availableFunds -= _amount;
        
        (bool success, ) = payable(treasury).call{value: _amount}("");
        require(success, "Transfer failed");
        
        emit FundsWithdrawn(treasury, _amount);
    }
    
    /**
     * @dev Get payout details for a claim
     * @param _claimId ID of the claim
     * @return Payout details
     */
    function getPayoutDetails(uint256 _claimId) external view returns (Payout memory) {
        return payouts[_claimId];
    }
    
    /**
     * @dev Get user's withdrawable balance
     * @param _user Address of the user
     * @return balance User's balance
     */
    function getUserBalance(address _user) external view returns (uint256) {
        return balances[_user];
    }
    
    /**
     * @dev Get contract balance
     * @return Total contract balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
