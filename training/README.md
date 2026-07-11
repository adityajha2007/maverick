# Fine-tuning Gemma 4 E2B for healthOS

Step-by-step guide to producing a medical-tuned Gemma 4 E2B and dropping it into the app. Free path via Kaggle Notebooks. Expected total wall time: **5-8 hours** (mostly waiting on training). Your active time: ~45 minutes.

## What you'll produce

1. A LoRA adapter fine-tuned on ~3,000 patient-doctor dialogues.
2. A merged full-weights checkpoint on your Hugging Face account.
3. **(Best case)** A `.litertlm` file that runs on-device via MediaPipe.
4. **(Fallback)** A merged checkpoint you can serve via Vertex AI or vLLM.

## Prerequisites (do all of these before starting)

- [ ] **Kaggle account** (free) — <https://www.kaggle.com/>. Verify your phone number in Account settings — required for GPU access.
- [ ] **Hugging Face account** (free) — <https://huggingface.co/join>.
- [ ] **HF access token** (Write scope) — <https://huggingface.co/settings/tokens> → New token → `HF_TOKEN_WRITE`, role Write. Copy it.
- [ ] **Accept the Gemma 4 license** in your browser — go to <https://huggingface.co/google/gemma-4-E2B-it> and click "Agree and access repository". Without this, downloads will 403.
- [ ] **Your HF username** — check <https://huggingface.co/settings/account>. You'll paste this into the notebook.

## Step-by-step

### 1. Upload the notebook to Kaggle (5 min)

1. Go to <https://www.kaggle.com/code> → **+ New Notebook**.
2. In the notebook editor, click **File → Import Notebook** → **Upload**.
3. Upload `training/finetune-healthcare.ipynb` from this repo.
4. The notebook opens in the editor.

### 2. Set your accelerator + secrets (5 min)

In the right sidebar:

1. **Session options → Accelerator → GPU T4 x2**. This gives you two free T4 GPUs.
2. **Add-ons → Secrets → Add Secret**:
   - Name: `HF_TOKEN`
   - Value: paste your HF write token from prerequisites.
   - Attach to notebook: ✅.

### 3. Edit the two config values (2 min)

At the top of the notebook there's a **CONFIG** cell. Change:

```python
HF_USERNAME = "your-hf-username"       # <-- your Hugging Face username
TUNED_MODEL_NAME = "gemma-4-E2B-healthcare"   # keep as-is, or rename
```

Everything else works out of the box.

### 4. Run All (5 min setup + hands-off training)

**Runtime → Run All**. Cells execute top to bottom:

| Cell | What | ~Time on T4 x2 |
|---|---|---|
| Install | Sets up unsloth + friends | 3-5 min |
| Login | Verifies your HF token | 30 s |
| Load base model | Downloads Gemma 4 E2B (~5 GB) | 5-10 min |
| Load dataset | Downloads HealthCareMagic-100k, takes 3K rows | 1-2 min |
| **Train** | 1 epoch QLoRA on 3K rows | **2-3 h** |
| Save + merge | Merges adapter, saves locally | 10 min |
| Push to HF | Uploads merged checkpoint to your HF | 15-30 min (5 GB up) |
| Vibe check | 10 prompts on base vs tuned | 5 min |
| **Attempt LiteRT conversion** | `ai-edge-torch` conversion pipeline | **30-90 min** (may fail) |

You can close the browser tab during training — Kaggle keeps running. Come back and check in ~3 hours.

### 5. Check the vibe (5 min active)

When training finishes, the notebook prints 10 prompt pairs (base answer vs tuned answer). Read them. If tuned answers look more clinical + less hedgy, you have a keeper. If they're worse (bad merge, over-tuned) — **stop here**. Do not spend time on conversion.

### 6. Handle the LiteRT conversion output

**If Cell "LiteRT convert" succeeds:**
- Downloads `gemma-4-E2B-healthcare.litertlm` to Kaggle's `/kaggle/working/` dir.
- The notebook pushes it to your HF as `<your-hf-username>/gemma-4-E2B-healthcare`.
- Copy the download URL — you'll paste it into `modelRegistry.ts` next.

**If it fails** (most likely cause: the `ai-edge-torch` LLM converter is still preview-tier):
- Read the error message. Common failures: unsupported op, quantization mismatch, OOM during conversion.
- **Fallback path A** (recommended for hackathon): deploy the merged HF model to Vertex AI as an endpoint. See `docs/superpowers/plans/2026-07-10-healthos-v02-tracks-1-2-3-plan.md` fallback section, or:
  ```bash
  # From your local machine, once you have gcloud installed
  gcloud auth login
  gcloud ai endpoints deploy-model-from-hf \
      --model=<your-hf-username>/gemma-4-E2B-healthcare \
      --region=us-central1
  ```
- **Fallback path B**: skip the tuned model entirely. Base Gemma 4 E2B is still what our current build targets.

### 7. Wire the tuned model into the app (15 min, on your Mac)

Open `app/src/services/gemma/modelRegistry.ts` and add:

```ts
gemma4_e2b_medical_tuned: {
  taskFileName: "gemma-4-E2B-healthcare.litertlm",
  downloadUrl: "https://huggingface.co/<your-hf-username>/gemma-4-E2B-healthcare/resolve/main/gemma-4-E2B-healthcare.litertlm",
  approxSizeBytes: 2_600_000_000,
  modality: "text",
},
```

Open `app/src/services/gemma/OnDeviceGemma.ts` and change:

```ts
const PRIMARY_KEY = "gemma4_e2b_medical_tuned";  // was "gemma4_e2b_text"
const FALLBACK_KEY = "gemma4_e2b_text";           // base as first fallback
// (second fallback to Gemma 3n stays wired inside the load routine)
```

Verify locally:

```bash
cd app
npm test           # expect 14/14 unchanged
npx tsc --noEmit   # expect no new errors
```

Push the `.litertlm` to your demo device:

```bash
adb push gemma-4-E2B-healthcare.litertlm \
  /sdcard/Android/data/com.healthos.app/files/models/
```

### 8. Update the pitch narration

Attribute the dataset in your pitch:

> "The chat isn't just Gemma 4 out of the box — we fine-tuned Gemma 4 E2B on 3,000 patient-doctor dialogues from HealthCareMagic, then converted it to LiteRT and shipped it on-device. The `.litertlm` file lives on the phone; no cloud round-trip."

Add to `SETUP.md` §14 and `DEMO_DRILL.md`:

> "Fine-tuned Gemma 4 E2B on HealthCareMagic-100k patient-doctor dialogues (CC BY-SA 4.0 — [lavita/ChatDoctor-HealthCareMagic-100k](https://huggingface.co/datasets/lavita/ChatDoctor-HealthCareMagic-100k))."

## Troubleshooting

**"Gated repo. Access request pending."** on Gemma download → you didn't accept the Gemma license in the browser. Do it: <https://huggingface.co/google/gemma-4-E2B-it>. Wait for automatic approval (usually seconds).

**Loss doesn't drop** (stays above 2.5 after 500 steps) → likely LR too high. Change `learning_rate=2e-4` → `learning_rate=1e-4` in the training cell, restart from Cell 5.

**OOM during training on T4 x2** → reduce `per_device_train_batch_size=2` → `1` and `gradient_accumulation_steps=4` → `8` in the training args. Same effective batch size, less peak memory.

**Kaggle session times out mid-training** → free-tier Kaggle notebooks max at 12 h. If you started fresh and used the ~5 h estimate above, you're fine. If it dies, restart and use the saved checkpoints in `outputs/`.

**LiteRT conversion says "unsupported model type"** → Google's on-device converter may not have caught up to Gemma 4 as of your run date. Use Fallback path A (Vertex AI deployment) instead.

**Pushed to HF but file isn't visible** → HF caches for ~30 s. Refresh your model page.

## What's in the notebook

The Kaggle notebook (`finetune-healthcare.ipynb`) has these sections, all runnable top-to-bottom:

1. Config — set HF username + model name.
2. Install — deps.
3. HF login.
4. Load Gemma 4 E2B base with QLoRA.
5. Load + format HealthCareMagic-100k.
6. Train (1 epoch).
7. Save adapter, merge, push to HF.
8. Vibe check (base vs tuned on 10 prompts).
9. Convert to `.litertlm` (attempt; may fail — see fallback in Step 6 above).
10. Push `.litertlm` to HF if produced.
