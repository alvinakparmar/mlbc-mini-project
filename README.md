# Image Hash DApp - Cryptographic & Perceptual Image Similarity Suite

A modern Web3-enabled DApp designed to solve two distinct image integrity challenges:
1. **Cryptographic Integrity (SHA-256)**: Verifies exact byte-for-byte authenticity and file tamperproofing.
2. **Visual Similarity (pHash, dHash, aHash)**: Detects visually similar images, subtle alterations, resolution scaling, compression, watermarks, or filter edits using perceptual algorithms.

---

## 🧭 Navigation Bar Tabs

The DApp features a responsive tab navigation bar:
- **📤 Upload & Store**: Select an image, view auto-computed SHA-256 and perceptual pHash/dHash/aHash, attach metadata, and anchor the hashes on the blockchain (or simulated node).
- **🔬 Compare Images**: Side-by-side comparison of Image A vs Image B. Features an interactive visual split diff slider, metric cards, Hamming distance counters, similarity score (`%`), and an automated verdict ("Identical", "Highly Similar", "Somewhat Similar", or "Different").
- **🗄️ Stored Hashes**: Historical records saved in `localStorage` under key `imageHashHistory`. Supports search filtering, thumbnail previews, hash copying, and JSON exporting.

---

## 🔬 Hash Algorithms Explained

| Hash Type | Algorithm | Sensitivity | Best For |
|---|---|---|---|
| **SHA-256** | SHA-2 Cryptographic Byte Hash | Extreme (1 bit change completely changes output) | File tampering & exact duplicate verification |
| **pHash** | Discrete Cosine Transform (DCT) Frequency | High | Robust similarity detection across compression, resizing, & color tweaks |
| **dHash** | Adjacent Pixel Difference Gradient | Medium | Detecting subtle structural edits & crop/gradient shifts |
| **aHash** | Average Pixel Intensity Comparison | Low | Fast basic similarity screening |

### ⚖️ Hamming Distance & Threshold Rules

Perceptual hashes produce 64-bit hexadecimal strings. Similarity is measured by the **Hamming Distance** (number of differing bits between two hashes):
- **Distance = 0** $\rightarrow$ **Identical** (100% Match)
- **Distance ≤ 5** $\rightarrow$ **Highly Similar** (Minor compression, slight resizing, or subtle color filter)
- **Distance 6 – 10** $\rightarrow$ **Somewhat Similar** (Moderate crop, watermark, or heavier edit)
- **Distance > 10** $\rightarrow$ **Different** (Distinct images)

Formula for similarity percentage:
$$\text{Similarity \%} = \left(1 - \frac{\text{Hamming Distance}}{64}\right) \times 100$$

---

## 📦 Technical Architecture & File Structure

```
image-hash-dapp/
├── index.html               # Main Web App markup with tab navigation
├── style.css                # Dark Glassmorphism CSS Design System
├── app.js                   # Application controller & state manager
├── hash-engine.js           # SHA-256 & pHash/dHash/aHash engine with fallback
├── web3-handler.js          # Web3 MetaMask & Simulated Blockchain provider
├── contracts/
│   └── ImageHashStore.sol   # Solidity smart contract for anchoring hashes
└── README.md                # Documentation
```

---

## 🚀 How to Run Locally

1. Open a terminal in this directory:
   ```bash
   cd C:\Users\Administrator\.gemini\antigravity\scratch\image-hash-dapp
   ```
2. Start any standard web server:
   - Node: `npx serve .`
   - Python: `python -m http.server 8080`
3. Open your browser at `http://localhost:8080`.
4. Click **"Load Sample Images"** in the **Compare Images** tab to instantly test pHash visual comparison!

---

## 📜 Smart Contract Deployment

The included Solidity contract `ImageHashStore.sol` can be deployed on Sepolia, Polygon, or local Hardhat/Anvil networks using Remix or Hardhat. Update `CONTRACT_ADDRESS` in `web3-handler.js` with your deployed address.
