/**
 * Hash Engine for Image Hash DApp
 * Handles SHA-256 (Cryptographic Integrity) and pHash, dHash, aHash (Perceptual Visual Similarity)
 */

window.HashEngine = (function () {
    /**
     * Compute SHA-256 cryptographic hash of a File or ArrayBuffer using native Web Crypto API
     */
    async function computeSHA256(fileOrBuffer) {
        let arrayBuffer;
        if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
            arrayBuffer = await fileOrBuffer.arrayBuffer();
        } else if (fileOrBuffer instanceof ArrayBuffer) {
            arrayBuffer = fileOrBuffer;
        } else {
            throw new Error("Invalid input for SHA-256: expected File, Blob, or ArrayBuffer");
        }

        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hexString = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        return hexString;
    }

    /**
     * Safely extract 16-char hex string from an ImageHash object or raw result
     */
    function extractHex(hashObj) {
        if (!hashObj) return "";
        if (typeof hashObj === "string") return hashObj;
        if (typeof hashObj.toHexString === "function") return hashObj.toHexString();
        if (typeof hashObj.hex === "string") return hashObj.hex;
        if (hashObj.binArray) {
            let hex = "";
            for (let i = 0; i < hashObj.binArray.length; i += 4) {
                const nibble = Array.from(hashObj.binArray.slice(i, i + 4)).join("");
                hex += parseInt(nibble.padEnd(4, "0"), 2).toString(16);
            }
            return hex;
        }
        if (typeof hashObj.toString === "function") {
            const str = hashObj.toString();
            if (str && str !== "[object Object]") return str;
        }
        return String(hashObj);
    }

    /**
     * Calculate 64-bit Hamming Distance between two hex hash strings
     */
    function hammingDistance(hex1, hex2) {
        if (!hex1 || !hex2) return 64;
        
        // Clean strings
        const h1 = extractHex(hex1).replace(/^0x/, "").toLowerCase().padStart(16, "0");
        const h2 = extractHex(hex2).replace(/^0x/, "").toLowerCase().padStart(16, "0");

        if (h1 === h2) return 0;

        let distance = 0;
        for (let i = 0; i < Math.min(h1.length, h2.length); i++) {
            const val1 = parseInt(h1[i], 16);
            const val2 = parseInt(h2[i], 16);
            if (isNaN(val1) || isNaN(val2)) continue;
            let xor = val1 ^ val2;
            while (xor > 0) {
                distance += xor & 1;
                xor >>= 1;
            }
        }
        return distance;
    }

    /**
     * Compute similarity percentage from Hamming distance (64-bit default)
     */
    function getSimilarityPercentage(distance, totalBits = 64) {
        const clampedDist = Math.max(0, Math.min(totalBits, distance));
        const pct = ((totalBits - clampedDist) / totalBits) * 100;
        return parseFloat(pct.toFixed(1));
    }

    /**
     * Determine visual similarity verdict based on pHash and dHash distances
     */
    function getVerdict(pHashDist, dHashDist) {
        const primaryDist = pHashDist;
        
        if (primaryDist === 0) {
            return {
                label: "Identical",
                badgeClass: "badge-success",
                color: "#10b981",
                description: "The images are perceptually identical. All visual feature frequencies match 100%."
            };
        } else if (primaryDist <= 5) {
            return {
                label: "Highly Similar",
                badgeClass: "badge-emerald",
                color: "#059669",
                description: "Minor alterations detected (e.g. slight compression, subtle resizing, or light color adjustment)."
            };
        } else if (primaryDist <= 10) {
            return {
                label: "Somewhat Similar",
                badgeClass: "badge-warning",
                color: "#f59e0b",
                description: "Moderate changes found (e.g. crop, watermark addition, heavy compression, or filter overlay)."
            };
        } else {
            return {
                label: "Different",
                badgeClass: "badge-danger",
                color: "#ef4444",
                description: "Significant visual divergence. These are distinctly different images."
            };
        }
    }

    // --- HTML5 CANVAS NATIVE FALLBACK HASHERS ---

    /**
     * Draw image onto canvas and get 2D context image data
     */
    function getGrayscaleImageData(imgElement, width, height) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(imgElement, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const grayscale = new Float32Array(width * height);

        for (let i = 0; i < data.length; i += 4) {
            // Standard relative luminance formula
            grayscale[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        return grayscale;
    }

    /**
     * Native aHash (Average Hash - 8x8)
     */
    function computeNativeAHash(imgElement) {
        const gray = getGrayscaleImageData(imgElement, 8, 8);
        let sum = 0;
        for (let i = 0; i < 64; i++) sum += gray[i];
        const avg = sum / 64;

        let binaryBits = "";
        for (let i = 0; i < 64; i++) {
            binaryBits += gray[i] >= avg ? "1" : "0";
        }
        return binaryToHex(binaryBits);
    }

    /**
     * Native dHash (Difference Hash - 9x8)
     */
    function computeNativeDHash(imgElement) {
        const gray = getGrayscaleImageData(imgElement, 9, 8);
        let binaryBits = "";
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const currentPixel = gray[y * 9 + x];
                const nextPixel = gray[y * 9 + x + 1];
                binaryBits += currentPixel > nextPixel ? "1" : "0";
            }
        }
        return binaryToHex(binaryBits);
    }

    /**
     * Native pHash (Perceptual DCT Hash - 32x32 -> 8x8 DCT)
     */
    function computeNativePHash(imgElement) {
        const size = 32;
        const gray = getGrayscaleImageData(imgElement, size, size);

        // 1D DCT coefficients precalculation table
        const dctMatrix = new Float32Array(size * size);
        for (let u = 0; u < size; u++) {
            for (let x = 0; x < size; x++) {
                const alpha = u === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size);
                dctMatrix[u * size + x] = alpha * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size));
            }
        }

        // 2D DCT calculation for top-left 8x8
        const dct8x8 = new Float32Array(64);
        for (let u = 0; u < 8; u++) {
            for (let v = 0; v < 8; v++) {
                let sum = 0;
                for (let x = 0; x < size; x++) {
                    for (let y = 0; y < size; y++) {
                        sum += gray[y * size + x] * dctMatrix[u * size + x] * dctMatrix[v * size + y];
                    }
                }
                dct8x8[u * 8 + v] = sum;
            }
        }

        // Compute median of 63 AC terms (excluding DC term at [0,0])
        const acValues = Array.from(dct8x8.slice(1));
        acValues.sort((a, b) => a - b);
        const median = acValues[Math.floor(acValues.length / 2)];

        let binaryBits = "";
        for (let i = 0; i < 64; i++) {
            binaryBits += dct8x8[i] > median ? "1" : "0";
        }
        return binaryToHex(binaryBits);
    }

    /**
     * Convert 64-bit binary string to 16-character Hex string
     */
    function binaryToHex(binaryStr) {
        let hex = "";
        for (let i = 0; i < binaryStr.length; i += 4) {
            const nibble = binaryStr.substring(i, i + 4);
            hex += parseInt(nibble, 2).toString(16);
        }
        return hex.padStart(16, "0");
    }

    /**
     * Main entry point to compute perceptual hashes (pHash, dHash, aHash) for an Image element
     * Tries imagehash-web CDN library first if available, falls back to native canvas implementation.
     */
    async function computePerceptualHashes(imgElement) {
        let pHashHex = "";
        let dHashHex = "";
        let aHashHex = "";
        let libraryUsed = "native-canvas";

        // Try imagehash-web library from window if loaded
        if (typeof window.phash === "function" || (window.ImageHashWeb && typeof window.ImageHashWeb.phash === "function")) {
            try {
                const phashFn = window.phash || window.ImageHashWeb.phash;
                const dhashFn = window.dhash || window.ImageHashWeb.dhash;
                const ahashFn = window.ahash || window.ImageHashWeb.ahash;

                const pResult = await phashFn(imgElement, 8);
                const dResult = await dhashFn(imgElement, 8);
                const aResult = await ahashFn(imgElement, 8);

                pHashHex = extractHex(pResult);
                dHashHex = extractHex(dResult);
                aHashHex = extractHex(aResult);
                libraryUsed = "imagehash-web (CDN)";
            } catch (err) {
                console.warn("imagehash-web CDN call threw error, using fallback native canvas hasher:", err);
            }
        }

        // Fallback or fill missing hashes using native canvas algorithms
        if (!pHashHex || pHashHex.includes("[object")) pHashHex = computeNativePHash(imgElement);
        if (!dHashHex || dHashHex.includes("[object")) dHashHex = computeNativeDHash(imgElement);
        if (!aHashHex || aHashHex.includes("[object")) aHashHex = computeNativeAHash(imgElement);

        return {
            pHash: pHashHex.toLowerCase(),
            dHash: dHashHex.toLowerCase(),
            aHash: aHashHex.toLowerCase(),
            engine: libraryUsed
        };
    }

    return {
        computeSHA256,
        computePerceptualHashes,
        hammingDistance,
        getSimilarityPercentage,
        getVerdict,
        extractHex,
        computeNativePHash,
        computeNativeDHash,
        computeNativeAHash
    };
})();
