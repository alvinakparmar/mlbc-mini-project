/**
 * Web3 Handler for Image Hash DApp
 * Supports live Web3 (MetaMask via Ethers.js) & built-in Simulated Blockchain Mode
 */

window.Web3Handler = (function () {
    let isSimulatedMode = true;
    let userAddress = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
    let blockNumber = 18492041;
    let isConnecting = false;
    
    // Contract details
    const CONTRACT_ADDRESS = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7";
    const CONTRACT_ABI = [
        "function storeHash(bytes32 sha256Hash, string pHash, string dHash, string title, string ownerName, string metadataUri) external",
        "function getRecord(bytes32 sha256Hash) external view returns (bytes32, string, string, string, string, string, address, uint256)",
        "function getTotalRecords() external view returns (uint256)",
        "event ImageStored(bytes32 indexed sha256Hash, string pHash, string dHash, string title, string ownerName, address indexed uploader, uint256 timestamp)"
    ];

    let provider = null;
    let signer = null;
    let contract = null;
    let simulatedLedger = [];

    /**
     * Initialize Web3 State
     */
    async function init() {
        if (window.ethereum) {
            try {
                provider = new ethers.providers.Web3Provider(window.ethereum);
                const accounts = await provider.listAccounts();
                if (accounts.length > 0) {
                    signer = provider.getSigner();
                    userAddress = accounts[0];
                    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
                    isSimulatedMode = false;
                }

                // Listen for account changes
                window.ethereum.on("accountsChanged", (accounts) => {
                    if (accounts && accounts.length > 0) {
                        userAddress = accounts[0];
                        signer = provider.getSigner();
                        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
                        isSimulatedMode = false;
                    } else {
                        isSimulatedMode = true;
                    }
                    updateUIStatus();
                });

            } catch (err) {
                console.warn("Ethereum detected but initialization deferred:", err);
            }
        }
        updateUIStatus();
    }

    /**
     * Connect MetaMask wallet safely & prompt account selection modal
     */
    async function connectWallet() {
        if (!window.ethereum) {
            throw new Error("MetaMask extension not found. Running in Simulated Blockchain Mode.");
        }

        if (isConnecting) {
            throw new Error("MetaMask request is already pending. Click your browser extension icon to approve!");
        }

        isConnecting = true;
        try {
            // Force MetaMask account selection modal (EIP-2255) so user can pick from multiple accounts
            try {
                await window.ethereum.request({
                    method: "wallet_requestPermissions",
                    params: [{ eth_accounts: {} }]
                });
            } catch (permErr) {
                if (permErr.code === 4001) {
                    isConnecting = false;
                    throw new Error("Account selection was cancelled.");
                }
                console.warn("wallet_requestPermissions notice:", permErr);
            }

            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            if (accounts && accounts.length > 0) {
                userAddress = accounts[0];
                provider = new ethers.providers.Web3Provider(window.ethereum);
                signer = provider.getSigner();
                contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
                isSimulatedMode = false;
            }
            isConnecting = false;
            updateUIStatus();
            return { address: userAddress, isSimulated: false };
        } catch (err) {
            isConnecting = false;
            if (err.code === -32002 || (err.message && err.message.includes("already pending"))) {
                throw new Error("MetaMask popup is already pending! Click the 🦊 extension icon in your browser toolbar to approve.");
            }
            if (err.code === 4001) {
                throw new Error("Connection request was cancelled.");
            }
            console.warn("Wallet connection notice:", err);
            throw err;
        }
    }

    /**
     * Toggle Simulated Mode vs Real Web3 Mode
     */
    function setSimulatedMode(enabled) {
        isSimulatedMode = enabled;
        updateUIStatus();
    }

    /**
     * Check if a hash already exists on-chain or in simulated ledger
     * Returns { exists: boolean, ownerName: string } 
     */
    async function checkHashExists(sha256Hex) {
        // Check simulated ledger first
        const existingSimulated = simulatedLedger.find(r => r.sha256 === sha256Hex);
        if (existingSimulated) {
            return { exists: true, ownerName: existingSimulated.ownerName || "Unknown" };
        }

        // Check on-chain if live mode and contract available
        if (!isSimulatedMode && contract) {
            try {
                const bytes32Hash = sha256Hex.startsWith("0x") ? sha256Hex : "0x" + sha256Hex;
                const record = await contract.getRecord(bytes32Hash);
                // record returns: (bytes32, string pHash, string dHash, string title, string ownerName, string metadataUri, address uploader, uint256 timestamp)
                if (record && record[7] && record[7].gt(0)) {
                    return { exists: true, ownerName: record[4] || "Unknown" };
                }
            } catch (e) {
                // "Record not found" revert means hash doesn't exist — that's fine
            }
        }

        return { exists: false, ownerName: "" };
    }

    /**
     * Store Hash On-Chain (Real or Simulated)
     */
    async function storeHashOnChain({ sha256, pHash, dHash, title, ownerName, metadataUri, onProgress }) {
        if (!isSimulatedMode && contract && signer) {
            try {
                if (onProgress) onProgress({ status: "signing", message: "Prompting MetaMask wallet signature..." });
                
                // Format SHA-256 as bytes32
                const bytes32Hash = sha256.startsWith("0x") ? sha256 : "0x" + sha256;
                const tx = await contract.storeHash(bytes32Hash, pHash, dHash, title, ownerName, metadataUri || "ipfs://QmSimulatedHash");
                
                if (onProgress) onProgress({ status: "mining", message: `Tx broadcast: ${tx.hash.slice(0, 10)}... Mining block...` });
                
                const receipt = await tx.wait();
                blockNumber = receipt.blockNumber;
                
                return {
                    success: true,
                    txHash: receipt.transactionHash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString(),
                    isSimulated: false
                };
            } catch (err) {
                console.warn("Real Web3 tx deferred/failed, falling back to simulated execution:", err);
            }
        }

        // --- SIMULATED BLOCKCHAIN MINING ---
        return new Promise((resolve) => {
            if (onProgress) onProgress({ status: "signing", message: "Signing simulated transaction..." });

            setTimeout(() => {
                if (onProgress) onProgress({ status: "mining", message: "Broadcasting to P2P nodes... Mining block # " + (blockNumber + 1) + "..." });
                
                setTimeout(() => {
                    blockNumber++;
                    const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
                    const gasUsed = (21000 + Math.floor(Math.random() * 15000)).toString();
                    
                    const record = {
                        txHash,
                        blockNumber,
                        gasUsed,
                        sha256,
                        pHash,
                        dHash,
                        title,
                        ownerName,
                        uploader: userAddress,
                        timestamp: Math.floor(Date.now() / 1000),
                        isSimulated: true
                    };

                    simulatedLedger.push(record);

                    resolve({
                        success: true,
                        txHash,
                        blockNumber,
                        gasUsed,
                        isSimulated: true
                    });
                }, 1800);
            }, 800);
        });
    }

    /**
     * Update UI Web3 status elements
     */
    function updateUIStatus() {
        const statusDot = document.getElementById("wallet-status-dot");
        const statusText = document.getElementById("wallet-status-text");
        const walletBtn = document.getElementById("connect-wallet-btn");
        const modeBadge = document.getElementById("mode-badge");

        if (statusText) {
            if (isSimulatedMode) {
                statusText.innerText = `Simulated Node (Block #${blockNumber})`;
                if (statusDot) statusDot.className = "status-dot status-simulated";
                if (walletBtn) walletBtn.innerHTML = `<i class="fa-solid fa-wallet"></i> Connect Wallet`;
                if (modeBadge) {
                    modeBadge.innerText = "Simulated Blockchain";
                    modeBadge.className = "badge badge-simulated";
                }
            } else {
                const shortAddr = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
                statusText.innerText = `Connected: ${shortAddr}`;
                if (statusDot) statusDot.className = "status-dot status-active";
                if (walletBtn) walletBtn.innerHTML = `<i class="fa-solid fa-wallet"></i> ${shortAddr} (Switch)`;
                if (modeBadge) {
                    modeBadge.innerText = "Web3 Active";
                    modeBadge.className = "badge badge-success";
                }
            }
        }
    }

    return {
        init,
        connectWallet,
        setSimulatedMode,
        storeHashOnChain,
        checkHashExists,
        isSimulated: () => isSimulatedMode,
        getUserAddress: () => userAddress,
        getBlockNumber: () => blockNumber,
        getContractAddress: () => CONTRACT_ADDRESS
    };
})();
