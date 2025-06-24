import { GoogleGenerativeAI } from "@google/generative-ai";

document.addEventListener('DOMContentLoaded', () => {
  const darkModeToggle = document.getElementById('darkModeToggle') as HTMLInputElement;
  const body = document.body;
  const menuItems = document.querySelectorAll('.menu-item');
  const views = document.querySelectorAll('.view');
  const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
  const aiModelSelect = document.getElementById('ai-model') as HTMLSelectElement;
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  const customPromptTextarea = document.getElementById('custom-prompt') as HTMLTextAreaElement;
  const scrapeButton = document.getElementById('scrape-button') as HTMLButtonElement;
  const stopButton = document.getElementById('stop-button') as HTMLButtonElement;
  const resultsList = document.getElementById('results-list');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const usageContainer = document.getElementById('usage-container');
  const tokenCountSpan = document.getElementById('token-count');
  const costEstimateSpan = document.getElementById('cost-estimate');

  let imageQueue: { src: string; base64: string; mimeType: string }[] = [];
  let totalImages = 0;
  let totalTokens = 0;
  let estimatedCost = 0;
  let isQueueProcessing = false;
  let genAI: GoogleGenerativeAI | null = null;

  const modelPricing: { [key: string]: { input: number, output: number } } = {
    'gemini-1.5-flash': { input: 0.0000025, output: 0.0000075 }, // Placeholder pricing
    'gemini-1.5-pro': { input: 0.0000125, output: 0.0000375 },
    'gemini-2.5-pro': { input: 0.0000250, output: 0.0000750 }, // Placeholder pricing
  };

  // Load saved dark mode state and API key
  chrome.storage.sync.get(['darkMode', 'aiModel', 'apiKey', 'customPrompt'], (data) => {
    if (data.darkMode) {
      body.classList.add('dark-mode');
      darkModeToggle.checked = true;
    }
    if (data.aiModel) {
      aiModelSelect.value = data.aiModel;
    }
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
      genAI = new GoogleGenerativeAI(data.apiKey);
    }
    if (data.customPrompt) {
      customPromptTextarea.value = data.customPrompt;
    }
  });

  // Toggle dark mode
  darkModeToggle.addEventListener('change', () => {
    body.classList.toggle('dark-mode');
    chrome.storage.sync.set({ darkMode: darkModeToggle.checked });
  });

  // Menu item active state and view switching
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const viewName = (item as HTMLElement).dataset.view;
      views.forEach(view => {
        if (view.id === `${viewName}-view`) {
          view.classList.remove('hidden');
        } else {
          view.classList.add('hidden');
        }
      });
      if (viewName === 'features') {
        const featuresView = document.getElementById('features-view');
        if (featuresView) {
          featuresView.classList.remove('hidden');
        }
      }
    });
  });

  // Save settings
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const aiModel = aiModelSelect.value;
    const apiKey = apiKeyInput.value;
    const customPrompt = customPromptTextarea.value;
    chrome.storage.sync.set({ aiModel, apiKey, customPrompt }, () => {
      if (apiKey) {
        genAI = new GoogleGenerativeAI(apiKey);
      }
      alert('Settings saved!');
    });
  });

  // Scrape images
  scrapeButton?.addEventListener('click', () => {
    if (!genAI) {
      alert('Please set your API key in the settings.');
      return;
    }
    scrapeButton.classList.add('hidden');
    stopButton.classList.remove('hidden');
    if (resultsList) {
      resultsList.innerHTML = '';
    }
    if (usageContainer) {
      usageContainer.classList.remove('hidden');
    }
    totalTokens = 0;
    estimatedCost = 0;
    if (progressContainer && progressBar) {
      progressContainer.classList.remove('hidden');
      progressBar.style.width = '0%';
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            files: ['dist/content.js'],
          },
          () => {
            chrome.tabs.sendMessage(tabs[0].id!, { action: 'scrapeImages' }, (response) => {
              imageQueue = response;
              totalImages = response.length;
              if (!isQueueProcessing) {
                processQueue();
              }
            });
          }
        );
      }
    });
  });

  stopButton.addEventListener('click', () => {
    imageQueue = [];
    isQueueProcessing = false;
    scrapeButton.classList.remove('hidden');
    stopButton.classList.add('hidden');
    if (progressContainer) {
      progressContainer.classList.add('hidden');
    }
  });

  async function processQueue() {
    isQueueProcessing = true;
    if (imageQueue.length === 0) {
      isQueueProcessing = false;
      scrapeButton.classList.remove('hidden');
      stopButton.classList.add('hidden');
      if (progressContainer) {
        setTimeout(() => {
          progressContainer.classList.add('hidden');
        }, 500);
      }
      return;
    }

    const image = imageQueue.shift();
    if (image) {
      const modelName = aiModelSelect.value;
      const result = await generatePrompt(image, modelName);
      if (result) {
        displayResult(image.src, result.prompt);
        totalTokens += result.tokens;
        const pricing = modelPricing[modelName];
        if (pricing) {
          estimatedCost += (result.tokens / 1000) * pricing.output; // Assuming output tokens for now
        }
        if (tokenCountSpan && costEstimateSpan) {
          tokenCountSpan.textContent = totalTokens.toString();
          costEstimateSpan.textContent = estimatedCost.toFixed(6);
        }
      }
    }

    if (progressBar) {
      const processedCount = totalImages - imageQueue.length;
      const progress = (processedCount / totalImages) * 100;
      progressBar.style.width = `${progress}%`;
    }

    if (isQueueProcessing) {
      setTimeout(processQueue, 2000); // 2-second delay to respect API rate limits
    }
  }

  async function generatePrompt(image: { src: string; base64: string; mimeType: string }, modelName: string): Promise<{ prompt: string, tokens: number } | null> {
    if (!genAI) {
      return { prompt: "API key not set.", tokens: 0 };
    }
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const customPrompt = customPromptTextarea.value || 'Generate a text-to-image AI prompt that can recreate it accurately.';

      const imagePart = {
        inlineData: {
          data: image.base64,
          mimeType: image.mimeType,
        },
      };

      const result = await model.generateContent([customPrompt, imagePart]);
      const prompt = result.response.text();
      const tokens = Math.ceil(prompt.length / 4);
      return { prompt, tokens };
    } catch (error) {
      console.error("Error generating prompt:", error);
      return { prompt: `Error generating prompt for model ${modelName}.`, tokens: 0 };
    }
  }

  function displayResult(imageUrl: string, prompt: string) {
    if (resultsList) {
      const resultItem = document.createElement('div');
      resultItem.className = 'result-item';

      const img = document.createElement('img');
      img.src = imageUrl;

      const p = document.createElement('p');
      p.textContent = prompt;

      resultItem.appendChild(img);
      resultItem.appendChild(p);
      resultsList.appendChild(resultItem);
    }
  }
});