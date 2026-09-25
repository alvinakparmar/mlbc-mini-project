/**
 * Main Application Logic for Image Hash DApp
 * Manages Tab Navigation, Drag & Drop Uploads, Visual Diff Inspector, and History Persistence
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- GLOBAL STATE ---
    let uploadImageFile = null;
    let uploadImageElement = null;
    let computedUploadHashes = null;

    let imageAFile = null;
    let imageAElement = null;
    let hashesA = null;

    let imageBFile = null;
    let imageBElement = null;
    let hashesB = null;

    // --- INIT APP ---
    initTabNavigation();
    initUploadTab();
    initCompareTab();
    initHistoryTab();
    initWeb3Controls();
    initCopyButtons();
    
    // Initialize Web3 Handler state
    Web3Handler.init();

    // Helper: Safely load and decode Image element
    function loadImageElement(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = async () => {
                if (img.decode) {
                    try { await img.decode(); } catch (e) {}
                }
                resolve(img);
            };
            img.onerror = (err) => reject(err);
            img.src = dataUrl;
        });
    }

    // --- TAB NAVIGATION ---
    function initTabNavigation() {
        const tabs = document.querySelectorAll(".nav-tab");
        const panes = document.querySelectorAll(".tab-pane");

        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const targetTabId = tab.getAttribute("data-tab");
                
                tabs.forEach(t => t.classList.remove("active"));
                panes.forEach(p => p.classList.remove("active"));

                tab.classList.add("active");
                const targetPane = document.getElementById(targetTabId);
                if (targetPane) targetPane.classList.add("active");

                // Update tab history list if history tab activated
                if (targetTabId === "tab-history") {
                    renderHistoryTable();
                }
            });
        });
    }

    // --- TAB 1: UPLOAD & STORE FLOW ---
    function initUploadTab() {
        const dropzone = document.getElementById("upload-dropzone");
        const fileInput = document.getElementById("upload-file-input");
        const promptBox = document.getElementById("upload-dropzone-prompt");
        const previewBox = document.getElementById("upload-preview-box");
        const previewImg = document.getElementById("upload-preview-img");
        const removeBtn = document.getElementById("upload-remove-btn");
        const imageMetaBar = document.getElementById("upload-image-meta");
        const submitBtn = document.getElementById("store-submit-btn");
        const storeForm = document.getElementById("store-onchain-form");

        dropzone.addEventListener("click", (e) => {
            if (e.target !== removeBtn && !removeBtn.contains(e.target)) {
                fileInput.click();
            }
        });

        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        });

        dropzone.addEventListener("dragleave", () => {
            dropzone.classList.remove("dragover");
        });

        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleUploadFile(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files[0]) {
                handleUploadFile(e.target.files[0]);
            }
        });

        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            resetUploadForm();
        });

        async function handleUploadFile(file) {
            if (!file.type.startsWith("image/")) {
                showToast("Please select a valid image file", "warning");
                return;
            }

            uploadImageFile = file;
            const reader = new FileReader();

            reader.onload = async (event) => {
                const dataUrl = event.target.result;
                previewImg.src = dataUrl;
                promptBox.classList.add("hidden");
                previewBox.classList.remove("hidden");

                const img = await loadImageElement(dataUrl);
                uploadImageElement = img;

                imageMetaBar.innerText = `${file.name} (${formatBytes(file.size)}) • ${img.naturalWidth || img.width}x${img.naturalHeight || img.height}px`;

                // Calculate Cryptographic SHA-256
                const sha256 = await HashEngine.computeSHA256(file);

                // Calculate Perceptual Hashes (pHash, dHash, aHash)
                const perceptual = await HashEngine.computePerceptualHashes(img);

                computedUploadHashes = {
                    sha256,
                    pHash: perceptual.pHash,
                    dHash: perceptual.dHash,
                    aHash: perceptual.aHash,
                    thumbnail: dataUrl
                };

                // Display computed hashes in UI
                document.getElementById("computed-sha256").innerText = sha256;
                document.getElementById("computed-phash").innerText = perceptual.pHash;
                document.getElementById("computed-dhash").innerText = perceptual.dHash;
                document.getElementById("computed-ahash").innerText = perceptual.aHash;

                // Mock IPFS metadata URI
                const ipfsUri = "ipfs://Qm" + sha256.slice(0, 44);
                document.getElementById("computed-ipfs-uri").innerText = ipfsUri;

                // Auto-fill title if empty
                const titleInput = document.getElementById("image-title-input");
                if (!titleInput.value) {
                    titleInput.value = file.name.replace(/\.[^/.]+$/, "");
                }

                submitBtn.disabled = false;
                showToast("Cryptographic & Perceptual Hashes calculated!", "success");
            };

            reader.readAsDataURL(file);
        }

        function resetUploadForm() {
            uploadImageFile = null;
            uploadImageElement = null;
            computedUploadHashes = null;
            fileInput.value = "";
            previewImg.src = "";
            previewBox.classList.add("hidden");
            promptBox.classList.remove("hidden");
            submitBtn.disabled = true;

            document.getElementById("computed-sha256").innerText = "-- Select Image First --";
            document.getElementById("computed-phash").innerText = "-- Select Image First --";
            document.getElementById("computed-dhash").innerText = "--";
            document.getElementById("computed-ahash").innerText = "--";
            document.getElementById("computed-ipfs-uri").innerText = "ipfs://Qm... (Generates on upload)";
        }

        // Store On-Chain Form Submission
        storeForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!computedUploadHashes) return;

            const title = document.getElementById("image-title-input").value;
            const author = document.getElementById("image-author-input").value.trim();
            const notes = document.getElementById("image-notes-input").value || "";
            const ipfsUri = document.getElementById("computed-ipfs-uri").innerText;

            // Validate owner name is provided
            if (!author) {
                showToast("Owner Name is required to anchor hashes on the blockchain.", "warning");
                document.getElementById("image-author-input").focus();
                return;
            }

            // --- DUPLICATE DETECTION ---
            // 1. Check localStorage for existing record with same SHA-256
            const localHistory = JSON.parse(localStorage.getItem("imageHashHistory") || "[]");
            const localDuplicate = localHistory.find(item => item.sha256 === computedUploadHashes.sha256);
            if (localDuplicate) {
                showToast(`⚠️ Duplicate Detected! This image hash is already stored. Original owner: ${localDuplicate.author || localDuplicate.ownerName || "Unknown"}`, "warning");
                return;
            }

            // 2. Check on-chain / simulated ledger via Web3Handler
            try {
                const existsCheck = await Web3Handler.checkHashExists(computedUploadHashes.sha256);
                if (existsCheck.exists) {
                    showToast(`⚠️ Duplicate Detected! This image hash is already anchored on the blockchain. Original owner: ${existsCheck.ownerName}`, "warning");
                    return;
                }
            } catch (checkErr) {
                console.warn("Duplicate check warning:", checkErr);
            }

            const miningBox = document.getElementById("mining-status-box");
            const miningTitle = document.getElementById("mining-status-title");

            miningBox.classList.remove("hidden");
            submitBtn.disabled = true;

            try {
                const result = await Web3Handler.storeHashOnChain({
                    sha256: computedUploadHashes.sha256,
                    pHash: computedUploadHashes.pHash,
                    dHash: computedUploadHashes.dHash,
                    title: title,
                    ownerName: author,
                    metadataUri: ipfsUri,
                    onProgress: (status) => {
                        miningTitle.innerText = status.message;
                    }
                });

                // Save to localStorage under key 'imageHashHistory'
                saveRecordToLocalStorage({
                    id: "hash_" + Date.now(),
                    filename: uploadImageFile ? uploadImageFile.name : "image.png",
                    title: title,
                    author: author,
                    ownerName: author,
                    notes: notes,
                    sha256: computedUploadHashes.sha256,
                    pHash: computedUploadHashes.pHash,
                    dHash: computedUploadHashes.dHash,
                    aHash: computedUploadHashes.aHash,
                    timestamp: Math.floor(Date.now() / 1000),
                    txHash: result.txHash,
                    blockNumber: result.blockNumber,
                    thumbnail: computedUploadHashes.thumbnail,
                    isSimulated: result.isSimulated
                });

                showToast(`Success! Hashes anchored in Block #${result.blockNumber}`, "success");
                miningBox.classList.add("hidden");

                // Switch to History Tab automatically after 1 second
                setTimeout(() => {
                    document.getElementById("tab-btn-history").click();
                }, 1000);

            } catch (err) {
                console.error("On-chain store error:", err);
                // Check if the error is a duplicate from the smart contract
                if (err.message && err.message.includes("already registered")) {
                    showToast("⚠️ Duplicate Detected! This image hash is already registered on the blockchain.", "warning");
                } else {
                    showToast("Failed to anchor on-chain: " + err.message, "danger");
                }
                miningBox.classList.add("hidden");
                submitBtn.disabled = false;
            }
        });
    }

    // --- TAB 2: COMPARE IMAGES FLOW ---
    function initCompareTab() {
        const fileInputA = document.getElementById("file-input-a");
        const fileInputB = document.getElementById("file-input-b");
        const dropzoneA = document.getElementById("dropzone-a");
        const dropzoneB = document.getElementById("dropzone-b");

        const previewImgA = document.getElementById("preview-img-a");
        const previewImgB = document.getElementById("preview-img-b");

        const removeBtnA = document.getElementById("remove-btn-a");
        const removeBtnB = document.getElementById("remove-btn-b");

        const runCompareBtn = document.getElementById("run-compare-btn");
        const loadSampleBtn = document.getElementById("load-sample-btn");

        // Bind Dropzone A
        setupDropzone(dropzoneA, fileInputA, removeBtnA, (file) => loadCompareImage("A", file));
        // Bind Dropzone B
        setupDropzone(dropzoneB, fileInputB, removeBtnB, (file) => loadCompareImage("B", file));

        function setupDropzone(dropzone, input, removeBtn, onFileSelected) {
            dropzone.addEventListener("click", (e) => {
                if (e.target !== removeBtn && !removeBtn.contains(e.target)) input.click();
            });
            dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
            dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
            dropzone.addEventListener("drop", (e) => {
                e.preventDefault();
                dropzone.classList.remove("dragover");
                if (e.dataTransfer.files && e.dataTransfer.files[0]) onFileSelected(e.dataTransfer.files[0]);
            });
            input.addEventListener("change", (e) => {
                if (e.target.files && e.target.files[0]) onFileSelected(e.target.files[0]);
            });
            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (removeBtn === removeBtnA) clearCompareImage("A");
                else clearCompareImage("B");
            });
        }

        async function loadCompareImage(target, file) {
            if (!file.type.startsWith("image/")) {
                showToast("Please select a valid image file", "warning");
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;
                const img = await loadImageElement(dataUrl);

                const sha256 = await HashEngine.computeSHA256(file);
                const perceptual = await HashEngine.computePerceptualHashes(img);

                if (target === "A") {
                    imageAFile = file;
                    imageAElement = img;
                    hashesA = { sha256, ...perceptual, dataUrl };
                    previewImgA.src = dataUrl;
                    document.getElementById("prompt-a").classList.add("hidden");
                    document.getElementById("preview-box-a").classList.remove("hidden");
                    document.getElementById("hash-summary-a").classList.remove("hidden");
                    document.getElementById("sha256-a-val").innerText = sha256.slice(0, 14) + "...";
                    document.getElementById("phash-a-val").innerText = perceptual.pHash;
                    document.getElementById("dhash-a-val").innerText = perceptual.dHash;
                    document.getElementById("image-a-badge").innerText = "Ready";
                    document.getElementById("image-a-badge").className = "badge badge-success";
                } else {
                    imageBFile = file;
                    imageBElement = img;
                    hashesB = { sha256, ...perceptual, dataUrl };
                    previewImgB.src = dataUrl;
                    document.getElementById("prompt-b").classList.add("hidden");
                    document.getElementById("preview-box-b").classList.remove("hidden");
                    document.getElementById("hash-summary-b").classList.remove("hidden");
                    document.getElementById("sha256-b-val").innerText = sha256.slice(0, 14) + "...";
                    document.getElementById("phash-b-val").innerText = perceptual.pHash;
                    document.getElementById("dhash-b-val").innerText = perceptual.dHash;
                    document.getElementById("image-b-badge").innerText = "Ready";
                    document.getElementById("image-b-badge").className = "badge badge-success";
                }

                if (hashesA && hashesB) {
                    runCompareBtn.disabled = false;
                }
            };
            reader.readAsDataURL(file);
        }

        function clearCompareImage(target) {
            if (target === "A") {
                imageAFile = null; imageAElement = null; hashesA = null;
                document.getElementById("preview-box-a").classList.add("hidden");
                document.getElementById("prompt-a").classList.remove("hidden");
                document.getElementById("hash-summary-a").classList.add("hidden");
                document.getElementById("image-a-badge").innerText = "Not Selected";
                document.getElementById("image-a-badge").className = "badge badge-info";
            } else {
                imageBFile = null; imageBElement = null; hashesB = null;
                document.getElementById("preview-box-b").classList.add("hidden");
                document.getElementById("prompt-b").classList.remove("hidden");
                document.getElementById("hash-summary-b").classList.add("hidden");
                document.getElementById("image-b-badge").innerText = "Not Selected";
                document.getElementById("image-b-badge").className = "badge badge-info";
            }
            runCompareBtn.disabled = true;
            document.getElementById("compare-results-section").classList.add("hidden");
            document.getElementById("visual-diff-section").classList.add("hidden");
        }

        // Run Comparison Button Action
        runCompareBtn.addEventListener("click", () => {
            if (!hashesA || !hashesB) return;

            // Calculate Hamming distances
            const pHashDist = HashEngine.hammingDistance(hashesA.pHash, hashesB.pHash);
            const dHashDist = HashEngine.hammingDistance(hashesA.dHash, hashesB.dHash);
            const aHashDist = HashEngine.hammingDistance(hashesA.aHash, hashesB.aHash);

            const sha256Match = hashesA.sha256.toLowerCase() === hashesB.sha256.toLowerCase();

            // Calculate similarity score
            const similarityPct = HashEngine.getSimilarityPercentage(pHashDist, 64);
            const verdict = HashEngine.getVerdict(pHashDist, dHashDist);

            // Populate Verdict Banner
            const verdictBadge = document.getElementById("verdict-badge");
            verdictBadge.innerText = verdict.label;
            verdictBadge.className = `badge badge-lg ${verdict.badgeClass}`;

            const verdictBanner = document.getElementById("verdict-banner");
            verdictBanner.style.borderColor = verdict.color;
            document.getElementById("verdict-title").innerText = `${verdict.label} (${similarityPct}% Match)`;
            document.getElementById("verdict-explanation").innerText = verdict.description;

            // Metrics Grid
            document.getElementById("metric-similarity-score").innerText = `${similarityPct}%`;
            document.getElementById("similarity-progress-fill").style.width = `${similarityPct}%`;
            document.getElementById("metric-phash-distance").innerText = pHashDist;
            document.getElementById("metric-dhash-distance").innerText = dHashDist;

            const sha256MetricEl = document.getElementById("metric-sha256-match");
            if (sha256Match) {
                sha256MetricEl.innerText = "100% Identical Bytes";
                sha256MetricEl.style.color = "var(--accent-emerald)";
            } else {
                sha256MetricEl.innerText = "Non-Matching Bytes";
                sha256MetricEl.style.color = "var(--accent-amber)";
            }

            // Detailed Comparison Table
            document.getElementById("table-sha256-a").innerText = hashesA.sha256.slice(0, 16) + "...";
            document.getElementById("table-sha256-b").innerText = hashesB.sha256.slice(0, 16) + "...";
            document.getElementById("table-sha256-diff").innerText = sha256Match ? "Exact Match" : "Diff Bytes";
            document.getElementById("table-sha256-diff").className = sha256Match ? "badge badge-success" : "badge badge-warning";
            document.getElementById("table-sha256-pct").innerText = sha256Match ? "100%" : "0%";

            document.getElementById("table-phash-a").innerText = hashesA.pHash;
            document.getElementById("table-phash-b").innerText = hashesB.pHash;
            document.getElementById("table-phash-diff").innerText = `Dist: ${pHashDist}`;
            document.getElementById("table-phash-diff").className = pHashDist <= 5 ? "badge badge-emerald" : (pHashDist <= 10 ? "badge badge-warning" : "badge badge-danger");
            document.getElementById("table-phash-pct").innerText = `${similarityPct}%`;

            document.getElementById("table-dhash-a").innerText = hashesA.dHash;
            document.getElementById("table-dhash-b").innerText = hashesB.dHash;
            document.getElementById("table-dhash-diff").innerText = `Dist: ${dHashDist}`;
            document.getElementById("table-dhash-pct").innerText = `${HashEngine.getSimilarityPercentage(dHashDist, 64)}%`;

            document.getElementById("table-ahash-a").innerText = hashesA.aHash;
            document.getElementById("table-ahash-b").innerText = hashesB.aHash;
            document.getElementById("table-ahash-diff").innerText = `Dist: ${aHashDist}`;
            document.getElementById("table-ahash-pct").innerText = `${HashEngine.getSimilarityPercentage(aHashDist, 64)}%`;

            // Setup Split Visual Diff Inspector
            document.getElementById("split-img-a").src = hashesA.dataUrl;
            document.getElementById("split-img-b").src = hashesB.dataUrl;
            initSplitSlider();

            document.getElementById("visual-diff-section").classList.remove("hidden");
            document.getElementById("compare-results-section").classList.remove("hidden");

            showToast("Perceptual comparison generated!", "info");
        });

        // Load Sample Images for Quick Testing (Generates 2 Distinctly Different Images)
        loadSampleBtn.addEventListener("click", () => {
            // Image A: Blue Indigo Circle pattern
            const canvasA = document.createElement("canvas");
            canvasA.width = 400; canvasA.height = 300;
            const ctxA = canvasA.getContext("2d");
            const gradA = ctxA.createLinearGradient(0, 0, 400, 300);
            gradA.addColorStop(0, "#4f46e5");
            gradA.addColorStop(1, "#06b6d4");
            ctxA.fillStyle = gradA;
            ctxA.fillRect(0, 0, 400, 300);
            ctxA.fillStyle = "#ffffff";
            ctxA.font = "bold 26px Outfit, sans-serif";
            ctxA.fillText("Blue Landscape v1", 80, 140);
            ctxA.beginPath(); ctxA.arc(200, 210, 40, 0, Math.PI * 2); ctxA.fill();

            const dataUrlA = canvasA.toDataURL("image/png");

            // Image B: Completely Different Red/Amber Triangle pattern
            const canvasB = document.createElement("canvas");
            canvasB.width = 400; canvasB.height = 300;
            const ctxB = canvasB.getContext("2d");
            const gradB = ctxB.createLinearGradient(0, 0, 400, 300);
            gradB.addColorStop(0, "#f43f5e");
            gradB.addColorStop(1, "#f59e0b");
            ctxB.fillStyle = gradB;
            ctxB.fillRect(0, 0, 400, 300);
            ctxB.fillStyle = "#ffffff";
            ctxB.font = "bold 26px Outfit, sans-serif";
            ctxB.fillText("Red Sunset v2", 110, 100);
            ctxB.beginPath();
            ctxB.moveTo(200, 150); ctxB.lineTo(300, 270); ctxB.lineTo(100, 270);
            ctxB.closePath(); ctxB.fillStyle = "#fef08a"; ctxB.fill();

            const dataUrlB = canvasB.toDataURL("image/png");

            // Load both distinct sample files into compare slots A and B
            fetch(dataUrlA).then(r => r.blob()).then(blob => {
                const fileA = new File([blob], "sample_blue_circle.png", { type: "image/png" });
                loadCompareImage("A", fileA);
            });

            fetch(dataUrlB).then(r => r.blob()).then(blob => {
                const fileB = new File([blob], "sample_red_sunset.png", { type: "image/png" });
                loadCompareImage("B", fileB);
            });

            showToast("2 Distinct Sample Images (Blue Circle vs Red Sunset) loaded into slots A & B!", "info");
        });
    }

    // Split Image Slider Handler
    function initSplitSlider() {
        const wrapper = document.getElementById("image-split-wrapper");
        const overlay = document.getElementById("split-overlay");
        const handle = document.getElementById("split-handle");
        let isDragging = false;

        function setSplitPosition(x) {
            const rect = wrapper.getBoundingClientRect();
            let posX = x - rect.left;
            if (posX < 0) posX = 0;
            if (posX > rect.width) posX = rect.width;
            const pct = (posX / rect.width) * 100;
            overlay.style.width = `${pct}%`;
            handle.style.left = `${pct}%`;
        }

        handle.onmousedown = () => isDragging = true;
        window.onmouseup = () => isDragging = false;
        window.onmousemove = (e) => {
            if (isDragging) setSplitPosition(e.clientX);
        };
    }

    // --- TAB 3: STORED HASHES (HISTORY) FLOW ---
    function initHistoryTab() {
        const searchInput = document.getElementById("history-search-input");
        const sortSelect = document.getElementById("history-sort-select");
        const exportBtn = document.getElementById("export-history-btn");
        const clearBtn = document.getElementById("clear-history-btn");

        searchInput.addEventListener("input", renderHistoryTable);
        sortSelect.addEventListener("change", renderHistoryTable);

        exportBtn.addEventListener("click", () => {
            const history = getHistoryFromLocalStorage();
            if (history.length === 0) {
                showToast("History is currently empty", "warning");
                return;
            }
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
            const downloadAnchor = document.createElement("a");
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `image_hash_history_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            showToast("Exported history to JSON!", "success");
        });

        clearBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to clear all stored image hash records from local storage?")) {
                localStorage.removeItem("imageHashHistory");
                renderHistoryTable();
                showToast("History cleared", "info");
            }
        });

        renderHistoryTable();
    }

    function getHistoryFromLocalStorage() {
        try {
            const jsonStr = localStorage.getItem("imageHashHistory");
            return jsonStr ? JSON.parse(jsonStr) : [];
        } catch (e) {
            console.error("LocalStorage read error:", e);
            return [];
        }
    }

    function saveRecordToLocalStorage(record) {
        const history = getHistoryFromLocalStorage();
        history.unshift(record); // Add newest first
        localStorage.setItem("imageHashHistory", JSON.stringify(history));
        renderHistoryTable();
    }

    function renderHistoryTable() {
        const tbody = document.getElementById("history-tbody");
        const emptyState = document.getElementById("history-empty-state");
        const table = document.getElementById("history-table");
        const countBadge = document.getElementById("history-count-badge");

        let history = getHistoryFromLocalStorage();

        if (countBadge) countBadge.innerText = history.length;

        if (history.length === 0) {
            table.classList.add("hidden");
            emptyState.classList.remove("hidden");
            return;
        } else {
            table.classList.remove("hidden");
            emptyState.classList.add("hidden");
        }

        // Apply Search Filter
        const query = document.getElementById("history-search-input").value.toLowerCase();
        if (query) {
            history = history.filter(item => 
                (item.title && item.title.toLowerCase().includes(query)) ||
                (item.filename && item.filename.toLowerCase().includes(query)) ||
                (item.sha256 && item.sha256.toLowerCase().includes(query)) ||
                (item.pHash && item.pHash.toLowerCase().includes(query))
            );
        }

        // Sort
        const sortBy = document.getElementById("history-sort-select").value;
        if (sortBy === "oldest") {
            history.sort((a, b) => a.timestamp - b.timestamp);
        } else if (sortBy === "title") {
            history.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        } else {
            history.sort((a, b) => b.timestamp - a.timestamp); // Newest
        }

        tbody.innerHTML = "";

        history.forEach((item) => {
            const tr = document.createElement("tr");
            
            const dateStr = new Date(item.timestamp * 1000).toLocaleString();

            tr.innerHTML = `
                <td>
                    <img src="${item.thumbnail || ''}" class="history-thumb" alt="thumb" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'><rect width=\'40\' height=\'40\' fill=\'%23111\'/></svg>'">
                </td>
                <td>
                    <strong>${escapeHtml(item.title || item.filename)}</strong>
                    <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(item.filename)}</div>
                </td>
                <td><code class="code-sm">${item.sha256.slice(0, 12)}...</code></td>
                <td><code class="code-sm">${item.pHash}</code></td>
                <td><span style="font-size:12px;">${dateStr}</span></td>
                <td>
                    <span class="badge ${item.isSimulated ? 'badge-simulated' : 'badge-success'}" title="${item.txHash}">
                        ${item.isSimulated ? 'Block #' + item.blockNumber : 'Web3 Anchored'}
                    </span>
                </td>
                <td>
                    <button class="btn-copy" onclick="navigator.clipboard.writeText('${item.sha256}'); window.showToast('Copied SHA-256!', 'info');" title="Copy SHA-256">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                    <button class="btn-copy" onclick="deleteHistoryItem('${item.id}')" title="Delete record" style="color:var(--accent-rose);">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.deleteHistoryItem = function(id) {
        let history = getHistoryFromLocalStorage();
        history = history.filter(item => item.id !== id);
        localStorage.setItem("imageHashHistory", JSON.stringify(history));
        renderHistoryTable();
        showToast("Record deleted", "info");
    };

    // --- WEB3 CONTROLS & TOGGLE ---
    function initWeb3Controls() {
        const simulatedToggle = document.getElementById("simulated-toggle-cb");
        const connectBtn = document.getElementById("connect-wallet-btn");

        simulatedToggle.addEventListener("change", (e) => {
            Web3Handler.setSimulatedMode(e.target.checked);
            showToast(e.target.checked ? "Switched to Simulated Blockchain Node" : "Switched to Live Web3 Provider", "info");
        });

        connectBtn.addEventListener("click", async () => {
            try {
                const wallet = await Web3Handler.connectWallet();
                simulatedToggle.checked = false;
                showToast(`Connected wallet: ${wallet.address.slice(0, 6)}...`, "success");
            } catch (err) {
                showToast(err.message, "warning");
            }
        });
    }

    // --- COPY HELPER ---
    function initCopyButtons() {
        document.querySelectorAll(".btn-copy").forEach(btn => {
            btn.addEventListener("click", () => {
                const targetId = btn.getAttribute("data-copy-target");
                if (targetId) {
                    const text = document.getElementById(targetId).innerText;
                    if (text && !text.includes("--")) {
                        navigator.clipboard.writeText(text);
                        showToast("Copied hash to clipboard!", "info");
                    }
                }
            });
        });
    }

    // --- UTILITIES ---
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    window.showToast = function(message, type = "info") {
        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        let iconClass = "fa-circle-info";
        if (type === "success") iconClass = "fa-circle-check";
        if (type === "warning") iconClass = "fa-triangle-exclamation";
        if (type === "danger") iconClass = "fa-circle-xmark";

        toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(100%)";
            toast.style.transition = "0.3s";
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    };
});
