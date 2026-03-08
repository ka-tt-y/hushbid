// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title MockNFT
 * @notice Simple ERC721 for demo auctions — fully on-chain metadata
 */
contract MockNFT is ERC721, Ownable {
    using Strings for uint256;

    uint256 public tokenCounter;

    constructor() ERC721("HushBid Demo NFT", "HBID") Ownable(msg.sender) {}

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = ++tokenCounter;
        _mint(to, tokenId);
    }

    function mintBatch(address to, uint256 count) external returns (uint256[] memory tokenIds) {
        tokenIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = ++tokenCounter;
            _mint(to, tokenId);
            tokenIds[i] = tokenId;
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        // Deterministic colour from tokenId
        bytes32 h = keccak256(abi.encodePacked(tokenId));
        string memory color = _toHexColor(h);

        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">',
            '<rect width="400" height="400" fill="#', color, '"/>',
            '<text x="200" y="180" font-size="48" fill="white" text-anchor="middle" font-family="monospace">HBID</text>',
            '<text x="200" y="250" font-size="80" fill="white" text-anchor="middle" font-family="monospace">#', tokenId.toString(), '</text>',
            '</svg>'
        ));

        string memory json = string(abi.encodePacked(
            '{"name":"HushBid Demo NFT #', tokenId.toString(),
            '","description":"A demo NFT for HushBid sealed-bid auctions",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        ));

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    /// @dev Extract 3 bytes from a hash to produce a hex colour string
    function _toHexColor(bytes32 h) internal pure returns (string memory) {
        bytes memory hex16 = "0123456789abcdef";
        bytes memory c = new bytes(6);
        for (uint256 i = 0; i < 3; i++) {
            uint8 b = uint8(h[i]);
            c[i * 2]     = hex16[b >> 4];
            c[i * 2 + 1] = hex16[b & 0x0f];
        }
        return string(c);
    }
}
