async function getBase64FromImageUrl(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Could not fetch image: ${url}, status: ${response.status}`);
      return null;
    }
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve({ base64, mimeType: blob.type });
      };
      reader.onerror = () => {
        console.warn(`Could not read blob for image: ${url}`);
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Error fetching or converting image ${url}:`, error);
    return null;
  }
}

async function scrapeImages(): Promise<{ src: string; base64: string; mimeType: string }[]> {
  let imageElements: HTMLImageElement[] = [];

  const mainElement = document.querySelector('main');
  if (mainElement) {
    imageElements = Array.from(mainElement.querySelectorAll('img'));
  } else {
    imageElements = Array.from(document.querySelectorAll('body img'));
  }

  const validImageElements = imageElements.filter(img => {
    const isMeaningfulSize = img.naturalWidth > 50 && img.naturalHeight > 50;
    const isSvg = img.src.toLowerCase().endsWith('.svg') || (img.src.startsWith('data:image/svg+xml'));
    return img.src && isMeaningfulSize && !isSvg;
  });

  const imagePromises = validImageElements.map(async (img) => {
    if (img.src.startsWith('data:')) {
      try {
        const parts = img.src.split(',');
        const meta = parts[0].split(';')[0].split(':')[1];
        const base64 = parts[1];
        return { src: img.src, base64, mimeType: meta };
      } catch (error) {
        console.warn(`Could not parse data URL: ${img.src}`, error);
        return null;
      }
    } else {
      const imageData = await getBase64FromImageUrl(img.src);
      if (imageData) {
        return {
          src: img.src,
          base64: imageData.base64,
          mimeType: imageData.mimeType,
        };
      }
      return null;
    }
  });

  const resolvedImages = await Promise.all(imagePromises);
  return resolvedImages.filter(img => img !== null) as { src: string; base64: string; mimeType: string }[];
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeImages') {
    setTimeout(async () => {
      const images = await scrapeImages();
      sendResponse(images);
    }, 500);
    return true;
  }
});