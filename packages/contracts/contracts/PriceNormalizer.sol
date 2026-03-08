// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title PriceNormalizer
 * @notice Normalizes bids across ETH/USDC/WETH using Chainlink Data Feeds
 * @dev All prices normalized to 8 decimals (Chainlink standard)
 */
contract PriceNormalizer {
    
    // Errors
    error UnsupportedToken();
    error StalePrice();
    error InvalidPrice();

    /// @notice ETH/USD price feed
    AggregatorV3Interface public immutable ethUsdFeed;

    /// @notice USDC/USD price feed  
    AggregatorV3Interface public immutable usdcUsdFeed;

    /// @notice WETH address (treated as ETH equivalent)
    address public immutable weth;

    /// @notice USDC address
    address public immutable usdc;

    /// @notice Maximum price staleness (1 hour)
    uint256 public constant MAX_STALENESS = 3600;

    /// @notice Price feed decimals
    uint8 public constant PRICE_DECIMALS = 8;

    /**
     * @param _ethUsdFeed Chainlink ETH/USD feed address
     * @param _usdcUsdFeed Chainlink USDC/USD feed address
     * @param _weth WETH token address
     * @param _usdc USDC token address
     */
    constructor(
        address _ethUsdFeed,
        address _usdcUsdFeed,
        address _weth,
        address _usdc
    ) {
        ethUsdFeed = AggregatorV3Interface(_ethUsdFeed);
        usdcUsdFeed = AggregatorV3Interface(_usdcUsdFeed);
        weth = _weth;
        usdc = _usdc;
    }


    /**
     * @notice Get the current ETH/USD price
     * @return price ETH price in USD (8 decimals)
     */
    function getEthUsdPrice() public view returns (uint256 price) {
        (, int256 answer,, uint256 updatedAt,) = ethUsdFeed.latestRoundData();
        
        if (block.timestamp - updatedAt > MAX_STALENESS) revert StalePrice();
        if (answer <= 0) revert InvalidPrice();
        
        price = uint256(answer);
    }

    /**
     * @notice Get the current USDC/USD price
     * @return price USDC price in USD (8 decimals)
     */
    function getUsdcUsdPrice() public view returns (uint256 price) {
        (, int256 answer,, uint256 updatedAt,) = usdcUsdFeed.latestRoundData();
        
        if (block.timestamp - updatedAt > MAX_STALENESS) revert StalePrice();
        if (answer <= 0) revert InvalidPrice();
        
        price = uint256(answer);
    }

    /**
     * @notice Normalize a bid amount to USD value (8 decimals)
     * @param token Payment token (address(0) for ETH, or WETH/USDC address)
     * @param amount Bid amount in token's native decimals
     * @return usdValue Value in USD (8 decimals)
     */
    function normalizeToUsd(
        address token,
        uint256 amount
    ) external view returns (uint256 usdValue) {
        if (token == address(0) || token == weth) {
            // ETH or WETH: 18 decimals
            // price = ETH/USD (8 decimals)
            // usdValue = amount * price / 1e18 (to get USD with 8 decimals)
            uint256 ethPrice = getEthUsdPrice();
            usdValue = (amount * ethPrice) / 1e18;
        } else if (token == usdc) {
            // USDC: 6 decimals
            // price = USDC/USD (8 decimals, ~1e8 for $1)
            // usdValue = amount * price / 1e6 (to get USD with 8 decimals)
            uint256 usdcPrice = getUsdcUsdPrice();
            usdValue = (amount * usdcPrice) / 1e6;
        } else {
            revert UnsupportedToken();
        }
    }

    /**
     * @notice Find the highest bid from an array (for settlement)
     * @param tokens Array of payment tokens
     * @param amounts Array of bid amounts
     * @return winnerIndex Index of the winning bid
     * @return highestUsd Highest bid in USD
     */
    function findHighestBid(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external view returns (uint256 winnerIndex, uint256 highestUsd) {
        require(tokens.length == amounts.length, "Length mismatch");
        require(tokens.length > 0, "No bids");

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 usdValue = this.normalizeToUsd(tokens[i], amounts[i]);
            if (usdValue > highestUsd) {
                highestUsd = usdValue;
                winnerIndex = i;
            }
        }
    }

    /**
     * @notice Get all prices in a single call (gas efficient for frontends)
     * @return ethUsd ETH/USD price
     * @return usdcUsd USDC/USD price
     */
    function getAllPrices() external view returns (uint256 ethUsd, uint256 usdcUsd) {
        ethUsd = getEthUsdPrice();
        usdcUsd = getUsdcUsdPrice();
    }
}
