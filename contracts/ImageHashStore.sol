// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ImageHashStore
 * @notice Smart contract for anchoring image SHA-256 cryptographic hashes and perceptual hashes on-chain.
 */
contract ImageHashStore {
    struct ImageRecord {
        bytes32 sha256Hash;
        string pHash;
        string dHash;
        string title;
        string ownerName;
        string metadataUri;
        address uploader;
        uint256 timestamp;
    }

    // Mapping from SHA-256 hash to ImageRecord
    mapping(bytes32 => ImageRecord) public records;

    // Array of all stored SHA-256 hashes
    bytes32[] public allHashes;

    // Events
    event ImageStored(
        bytes32 indexed sha256Hash,
        string pHash,
        string dHash,
        string title,
        string ownerName,
        address indexed uploader,
        uint256 timestamp
    );

    /**
     * @notice Store a new image record on-chain
     * @param sha256Hash Cryptographic SHA-256 hash (bytes32)
     * @param pHash Perceptual pHash string (hex)
     * @param dHash Difference dHash string (hex)
     * @param title User title for the image
     * @param metadataUri IPFS or JSON metadata URI
     */
    function storeHash(
        bytes32 sha256Hash,
        string calldata pHash,
        string calldata dHash,
        string calldata title,
        string calldata ownerName,
        string calldata metadataUri
    ) external {
        require(sha256Hash != bytes32(0), "Invalid SHA-256 hash");
        require(bytes(ownerName).length > 0, "Owner name is required");
        require(records[sha256Hash].timestamp == 0, "Image hash already registered on-chain");

        records[sha256Hash] = ImageRecord({
            sha256Hash: sha256Hash,
            pHash: pHash,
            dHash: dHash,
            title: title,
            ownerName: ownerName,
            metadataUri: metadataUri,
            uploader: msg.sender,
            timestamp: block.timestamp
        });

        allHashes.push(sha256Hash);

        emit ImageStored(sha256Hash, pHash, dHash, title, ownerName, msg.sender, block.timestamp);
    }

    /**
     * @notice Retrieve an image record by its SHA-256 hash
     */
    function getRecord(bytes32 sha256Hash) external view returns (
        bytes32 hash,
        string memory pHash,
        string memory dHash,
        string memory title,
        string memory ownerName,
        string memory metadataUri,
        address uploader,
        uint256 timestamp
    ) {
        ImageRecord memory rec = records[sha256Hash];
        require(rec.timestamp > 0, "Record not found");
        return (rec.sha256Hash, rec.pHash, rec.dHash, rec.title, rec.ownerName, rec.metadataUri, rec.uploader, rec.timestamp);
    }

    /**
     * @notice Get total count of stored image hashes
     */
    function getTotalRecords() external view returns (uint256) {
        return allHashes.length;
    }
}
