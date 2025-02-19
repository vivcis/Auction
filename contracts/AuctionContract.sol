// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ReverseDutchAuctionSwap {
    using SafeERC20 for IERC20;

    IERC20 public tokenForSale;
    IERC20 public paymentToken;
    uint256 public initialPrice;
    uint256 public finalPrice;
    uint256 public duration;
    uint256 public startTime;
    uint256 public priceDecreasePerSecond;
    uint256 public tokensForSale;
    bool public saleActive;
    address public seller;

    event AuctionStarted(address indexed seller, uint256 tokensForSale, uint256 initialPrice, uint256 duration, uint256 priceDecreasePerSecond);
    event AuctionFunded(uint256 tokensFunded);
    event TokenPurchased(address indexed buyer, uint256 amountPaid, uint256 tokensBought, uint256 finalPrice);
    event AuctionEnded(address indexed seller, uint256 totalReceived);

    constructor(
        address _tokenForSale,
        address _paymentToken,
        uint256 _tokensForSale,
        uint256 _initialPrice,
        uint256 _finalPrice,
        uint256 _duration
    ) {
        require(_initialPrice > _finalPrice, "Initial price must be higher than final price");
        require(_duration > 0, "Duration must be > 0");
        seller = msg.sender;
        tokenForSale = IERC20(_tokenForSale);
        paymentToken = IERC20(_paymentToken);
        tokensForSale = _tokensForSale;
        initialPrice = _initialPrice;
        finalPrice = _finalPrice;
        duration = _duration;
        startTime = block.timestamp;
        saleActive = true;
        priceDecreasePerSecond = (_initialPrice - _finalPrice) / _duration;
        emit AuctionStarted(seller, tokensForSale, initialPrice, duration, priceDecreasePerSecond);
    }

    function fundAuction() external {
        require(msg.sender == seller, "Only seller can fund auction");
        tokenForSale.safeTransferFrom(msg.sender, address(this), tokensForSale);
        emit AuctionFunded(tokensForSale);
    }

    function getCurrentPrice() public view returns (uint256) {
        if (block.timestamp >= startTime + duration) {
            return finalPrice;
        }
        uint256 elapsed = block.timestamp - startTime;
        uint256 reduction = priceDecreasePerSecond * elapsed;
        return initialPrice - reduction;
    }

    function buy(uint256 amountTokens) external {
        require(saleActive, "Auction not active");
        require(amountTokens > 0 && amountTokens <= tokensForSale, "Invalid token amount");
        uint256 currentPrice = getCurrentPrice();
        uint256 totalCost = currentPrice * amountTokens;
        paymentToken.safeTransferFrom(msg.sender, seller, totalCost);
        tokenForSale.safeTransfer(msg.sender, amountTokens);
        tokensForSale -= amountTokens;
        emit TokenPurchased(msg.sender, totalCost, amountTokens, currentPrice);
        if (tokensForSale == 0) {
            saleActive = false;
            emit AuctionEnded(seller, totalCost);
        }
    }
}
