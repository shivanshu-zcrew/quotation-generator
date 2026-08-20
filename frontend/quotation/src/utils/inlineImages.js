import { convertBatchS3KeysToUrls } from "../hooks/useS3Image";

// Inline images inserted into Terms & Conditions (TermsCondition.jsx) carry
// their durable S3 key as a data-s3-key attribute, because the src they're
// saved with is a signed URL that expires (at most 1 hour — see
// backend/controllers/quotationController.js's getSignedUrl). Call this
// after rendering any HTML that might contain such images — the read-only
// TermsViewer/CommentableHtml, and anywhere else terms content is shown —
// so a since-expired src gets replaced with a fresh one before the user
// ever sees a broken image. (The live Quill editor needs one extra step
// beyond this — see reconcileInlineImages in TermsCondition.jsx — because
// Quill's own parser drops data-s3-key when loading saved content back in;
// this function alone is enough anywhere the HTML is just rendered as-is.)
export async function refreshRenderedImages(containerEl) {
  if (!containerEl) return;
  const images = Array.from(containerEl.querySelectorAll("img[data-s3-key]"));
  if (images.length === 0) return;
  const keys = [...new Set(images.map((img) => img.getAttribute("data-s3-key")).filter(Boolean))];
  if (keys.length === 0) return;
  const urls = await convertBatchS3KeysToUrls(keys);
  images.forEach((img) => {
    const key = img.getAttribute("data-s3-key");
    const url = urls[key];
    if (url && img.getAttribute("src") !== url) img.setAttribute("src", url);
  });
}
