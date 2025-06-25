import { GoogleGenerativeAI } from "@google/generative-ai";

document.addEventListener('DOMContentLoaded', () => {
  
  function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id "${id}" not found. Check your HTML.`);
    }
    return element as T;
  }

  const ui = {
    body: document.body,
    darkModeToggle: getElement<HTMLInputElement>('darkModeToggle'),
    menuItems: document.querySelectorAll('.menu-item'),
    views: document.querySelectorAll('.view'),
    settingsForm: getElement<HTMLFormElement>('settings-form'),
    aiModelSelect: getElement<HTMLSelectElement>('ai-model'),
    apiKeyInput: getElement<HTMLInputElement>('api-key'),
    customPromptTextarea: getElement<HTMLTextAreaElement>('custom-prompt'),
    scrapeButton: getElement<HTMLButtonElement>('scrape-button'),
    stopButton: getElement<HTMLButtonElement>('stop-button'),
    resultsList: getElement<HTMLElement>('results-list'),
    progressContainer: getElement<HTMLElement>('progress-container'),
    progressBar: getElement<HTMLElement>('progress-bar'),
    usageContainer: getElement<HTMLElement>('usage-container'),
    tokenCountSpan: getElement<HTMLElement>('token-count'),
    costEstimateSpan: getElement<HTMLElement>('cost-estimate'),
    tabGroupsContainer: getElement<HTMLElement>('tab-groups-container'),
  };

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
      ui.body.classList.add('dark-mode');
      ui.darkModeToggle.checked = true;
    }
    if (data.aiModel) {
      ui.aiModelSelect.value = data.aiModel;
    }
    if (data.apiKey) {
      ui.apiKeyInput.value = data.apiKey;
      genAI = new GoogleGenerativeAI(data.apiKey);
    }
    if (data.customPrompt) {
      ui.customPromptTextarea.value = data.customPrompt;
    }
  });

  // Toggle dark mode
  ui.darkModeToggle.addEventListener('change', () => {
    ui.body.classList.toggle('dark-mode');
    chrome.storage.sync.set({ darkMode: ui.darkModeToggle.checked });
  });

  // Menu item active state and view switching
  const allMenuItems = document.querySelectorAll('.menu-item');
  allMenuItems.forEach(item => {
    if (item.id === 'tools-menu') {
      item.addEventListener('click', (e) => e.preventDefault());
      return;
    }

    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Remove active class from all menu items
      allMenuItems.forEach(i => i.classList.remove('active'));
      
      // Add active class to the clicked item
      item.classList.add('active');

      const viewName = (item as HTMLElement).dataset.view;
      if (!viewName) return;

      // If the item is in a dropdown, also mark the parent as active
      const parentDropdown = item.closest('.dropdown');
      if (parentDropdown) {
        parentDropdown.querySelector('.menu-item')?.classList.add('active');
      }

      ui.views.forEach(view => {
        if (view.id === `${viewName}-view`) {
          view.classList.remove('hidden');
        } else {
          view.classList.add('hidden');
        }
      });

      if (viewName === 'tabs') {
        renderTabs();
      }
    });
  });

  // Save settings
  ui.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const aiModel = ui.aiModelSelect.value;
    const apiKey = ui.apiKeyInput.value;
    const customPrompt = ui.customPromptTextarea.value;
    chrome.storage.sync.set({ aiModel, apiKey, customPrompt }, () => {
      if (apiKey) {
        genAI = new GoogleGenerativeAI(apiKey);
      }
      alert('Settings saved!');
    });
  });

  // Scrape images
  ui.scrapeButton.addEventListener('click', () => {
    if (!genAI) {
      alert('Please set your API key in the settings.');
      return;
    }
    ui.scrapeButton.classList.add('hidden');
    ui.stopButton.classList.remove('hidden');
    if (ui.resultsList) {
      ui.resultsList.innerHTML = '';
    }
    if (ui.usageContainer) {
      ui.usageContainer.classList.remove('hidden');
    }
    totalTokens = 0;
    estimatedCost = 0;
    if (ui.progressContainer && ui.progressBar) {
      ui.progressContainer.classList.remove('hidden');
      ui.progressBar.style.width = '0%';
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

  ui.stopButton.addEventListener('click', () => {
    imageQueue = [];
    isQueueProcessing = false;
    ui.scrapeButton.classList.remove('hidden');
    ui.stopButton.classList.add('hidden');
    if (ui.progressContainer) {
      ui.progressContainer.classList.add('hidden');
    }
  });

  async function processQueue() {
    isQueueProcessing = true;
    if (imageQueue.length === 0) {
      isQueueProcessing = false;
      ui.scrapeButton.classList.remove('hidden');
      ui.stopButton.classList.add('hidden');
      if (ui.progressContainer) {
        setTimeout(() => {
          ui.progressContainer.classList.add('hidden');
        }, 500);
      }
      return;
    }

    const image = imageQueue.shift();
    if (image) {
      const modelName = ui.aiModelSelect.value;
      const result = await generatePrompt(image, modelName);
      if (result) {
        displayResult(image.src, result.prompt);
        totalTokens += result.tokens;
        const pricing = modelPricing[modelName];
        if (pricing) {
          estimatedCost += (result.tokens / 1000) * pricing.output; // Assuming output tokens for now
        }
        if (ui.tokenCountSpan && ui.costEstimateSpan) {
          ui.tokenCountSpan.textContent = totalTokens.toString();
          ui.costEstimateSpan.textContent = estimatedCost.toFixed(6);
        }
      }
    }

    if (ui.progressBar) {
      const processedCount = totalImages - imageQueue.length;
      const progress = (processedCount / totalImages) * 100;
      ui.progressBar.style.width = `${progress}%`;
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
      const customPrompt = ui.customPromptTextarea.value || 'Generate a text-to-image AI prompt that can recreate it accurately.';

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
    if (ui.resultsList) {
      const resultItem = document.createElement('div');
      resultItem.className = 'result-item';

      const img = document.createElement('img');
      img.src = imageUrl;

      const p = document.createElement('p');
      p.textContent = prompt;

      resultItem.appendChild(img);
      resultItem.appendChild(p);
      ui.resultsList.appendChild(resultItem);
    }
  }
  function renderTabs() {
    chrome.tabs.query({}, (tabs) => {
      const groupedTabs: { [domain: string]: chrome.tabs.Tab[] } = {};

      tabs.forEach(tab => {
        if (tab.url) {
          try {
            const domain = new URL(tab.url).hostname;
            if (!groupedTabs[domain]) {
              groupedTabs[domain] = [];
            }
            groupedTabs[domain].push(tab);
          } catch (error) {
            console.warn(`Could not parse URL for tab: ${tab.url}`, error);
          }
        }
      });

      ui.tabGroupsContainer.innerHTML = ''; // Clear previous content

      for (const domain in groupedTabs) {
        const group = groupedTabs[domain];
        const groupElement = document.createElement('div');
        groupElement.className = 'tab-group';

        const header = document.createElement('div');
        header.className = 'tab-group-header';

        const favicon = document.createElement('img');
        favicon.className = 'favicon';
        favicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
        header.appendChild(favicon);

        const domainName = document.createElement('span');
        domainName.textContent = domain;
        header.appendChild(domainName);

        groupElement.appendChild(header);

        const tabList = document.createElement('ul');
        tabList.className = 'tab-list';

        group.forEach(tab => {
          const tabItem = document.createElement('li');
          tabItem.className = 'tab-item';
          tabItem.dataset.tabId = tab.id?.toString();

          const tabFavicon = document.createElement('img');
          tabFavicon.className = 'favicon';
          if (tab.favIconUrl) {
            tabFavicon.src = tab.favIconUrl;
          } else {
            // Fallback to Google's favicon service if not available
            tabFavicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
          }
          tabItem.appendChild(tabFavicon);

          const tabTitle = document.createElement('span');
          tabTitle.className = 'tab-item-title';
          tabTitle.textContent = tab.title || 'Untitled Tab';
          tabItem.appendChild(tabTitle);

          tabItem.addEventListener('click', () => {
            if (tab.id) {
              chrome.tabs.update(tab.id, { active: true });
              if (tab.windowId) {
                chrome.windows.update(tab.windowId, { focused: true });
              }
            }
          });

          tabList.appendChild(tabItem);
        });

        groupElement.appendChild(tabList);
        ui.tabGroupsContainer.appendChild(groupElement);
      }
    });
  }
  function isTabsViewActive() {
    const tabsView = document.getElementById('tabs-view');
    return tabsView && !tabsView.classList.contains('hidden');
  }

  chrome.tabs.onCreated.addListener(() => {
    if (isTabsViewActive()) {
      renderTabs();
    }
  });

  chrome.tabs.onRemoved.addListener(() => {
    if (isTabsViewActive()) {
      renderTabs();
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // We only care about URL or title changes
    if (changeInfo.url || changeInfo.title) {
      if (isTabsViewActive()) {
        renderTabs();
      }
    }
  });
});