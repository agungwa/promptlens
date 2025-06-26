import { GoogleGenerativeAI } from "@google/generative-ai";

document.addEventListener('DOMContentLoaded', () => {
  
  // --- HELPERS ---
  function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id "${id}" not found. Check your HTML.`);
    }
    return element as T;
  }

  function isTabsViewActive(): boolean {
    const tabsView = document.getElementById('tabs-view');
    return tabsView ? !tabsView.classList.contains('hidden') : false;
  }

  // --- UI ELEMENTS ---
  const ui = {
    body: document.body,
    darkModeToggle: getElement<HTMLInputElement>('darkModeToggle'),
    menuItems: document.querySelectorAll('.menu-item'),
    views: document.querySelectorAll('.view'),
    settingsForm: getElement<HTMLFormElement>('settings-form'),
    aiModelSelect: getElement<HTMLSelectElement>('ai-model'),
    apiKeyInput: getElement<HTMLInputElement>('api-key'),
    customPromptTextarea: getElement<HTMLTextAreaElement>('custom-prompt'),
    defaultToolSelect: getElement<HTMLSelectElement>('default-tool'),
    scrapeButton: getElement<HTMLButtonElement>('scrape-button'),
    stopButton: getElement<HTMLButtonElement>('stop-button'),
    resultsList: getElement<HTMLElement>('results-list'),
    progressContainer: getElement<HTMLElement>('progress-container'),
    progressBar: getElement<HTMLElement>('progress-bar'),
    usageContainer: getElement<HTMLElement>('usage-container'),
    tokenCountSpan: getElement<HTMLElement>('token-count'),
    costEstimateSpan: getElement<HTMLElement>('cost-estimate'),
    tabGroupsContainer: getElement<HTMLElement>('tab-groups-container'),
    expandAllBtn: getElement<HTMLButtonElement>('expand-all-btn'),
    collapseAllBtn: getElement<HTMLButtonElement>('collapse-all-btn'),
    summaryPopover: getElement<HTMLElement>('summary-popover'),
    tabSearchInput: getElement<HTMLInputElement>('tab-search-input'),
  };

  // --- STATE ---
  let imageQueue: { src: string; base64: string; mimeType: string }[] = [];
  let totalImages = 0;
  let totalTokens = 0;
  let estimatedCost = 0;
  let isQueueProcessing = false;
  let genAI: GoogleGenerativeAI | null = null;
  let allTabsCache: chrome.tabs.Tab[] = [];

  const modelPricing: { [key: string]: { input: number, output: number } } = {
    'gemini-1.5-flash': { input: 0.0000025, output: 0.0000075 },
    'gemini-1.5-pro': { input: 0.0000125, output: 0.0000375 },
    'gemini-2.5-pro': { input: 0.0000250, output: 0.0000750 },
  };

  // --- CORE FUNCTIONS ---

  async function getTabSummary(tab: chrome.tabs.Tab, buttonElement: HTMLButtonElement) {
    if (!genAI) {
      alert('Please set your API key in the settings.');
      return;
    }
    if (!tab.id) return;

    buttonElement.innerHTML = '<div class="loading-spinner"></div>';

    try {
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerText.slice(0, 4000),
      });

      if (injectionResults && injectionResults[0] && injectionResults[0].result) {
        const content = injectionResults[0].result;
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(`Summarize the following content in one concise sentence: ${content}`);
        const summary = result.response.text();
        
        ui.summaryPopover.textContent = summary;
        ui.summaryPopover.classList.remove('hidden');

        const rect = buttonElement.getBoundingClientRect();
        ui.summaryPopover.style.top = `${rect.bottom + window.scrollY}px`;
        ui.summaryPopover.style.left = `${rect.left + window.scrollX - ui.summaryPopover.offsetWidth}px`;

        setTimeout(() => {
          document.addEventListener('click', () => ui.summaryPopover.classList.add('hidden'), { once: true });
        }, 0);
      } else {
        throw new Error("Failed to get content from tab.");
      }
    } catch (error) {
      console.error("Error getting tab summary:", error);
      ui.summaryPopover.textContent = 'Could not access tab content. Please reload the tab and try again.';
      ui.summaryPopover.classList.remove('hidden');
    } finally {
      buttonElement.innerHTML = '✨';
    }
  }

  function renderTabs(tabsToRender?: chrome.tabs.Tab[]) {
    const tabs = tabsToRender || allTabsCache;
    const groupedTabs: { [domain: string]: chrome.tabs.Tab[] } = {};
    const tabDataMap = new Map<string, chrome.tabs.Tab>();

    tabs.forEach(tab => {
      if (tab.url && tab.id) {
        try {
          const domain = new URL(tab.url).hostname;
          if (!groupedTabs[domain]) groupedTabs[domain] = [];
          groupedTabs[domain].push(tab);
          tabDataMap.set(tab.id.toString(), tab);
        } catch (error) {
          console.warn(`Could not parse URL for tab: ${tab.url}`, error);
        }
      }
    });

    ui.tabGroupsContainer.innerHTML = '';

    if (tabs.length === 0 && ui.tabSearchInput.value) {
      ui.tabGroupsContainer.innerHTML = '<p>No open tabs match your search.</p>';
    }

    for (const domain in groupedTabs) {
      const group = groupedTabs[domain];
      const groupElement = document.createElement('div');
      groupElement.className = 'tab-group collapsed';

      const header = document.createElement('div');
      header.className = 'tab-group-header';
      header.innerHTML = `
        <img class="favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" />
        <span>${domain}</span>
        <span class="tab-group-arrow">&#9660;</span>
      `;
      header.addEventListener('click', () => groupElement.classList.toggle('collapsed'));
      
      const tabList = document.createElement('ul');
      tabList.className = 'tab-list';

      group.forEach(tab => {
        if (!tab.id) return;
        const tabId = tab.id.toString();
        const tabItem = document.createElement('li');
        tabItem.className = 'tab-item';
        tabItem.dataset.tabId = tabId;
        
        tabItem.innerHTML = `
          <div class="tab-link">
            <img class="favicon" src="${tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=16`}" />
            <span class="tab-item-title">${tab.title || 'Untitled Tab'}</span>
          </div>
          <button class="ai-summary-button" data-tab-id="${tabId}">✨</button>
          <button class="close-tab-button" data-tab-id="${tabId}">&times;</button>
        `;
        tabList.appendChild(tabItem);
      });

      groupElement.appendChild(header);
      groupElement.appendChild(tabList);
      ui.tabGroupsContainer.appendChild(groupElement);
    }
    
    (ui.tabGroupsContainer as any)._tabDataMap = tabDataMap;
  }

  async function performSearch(query: string) {
    if (!query) {
      renderTabs();
      return;
    }

    if (!genAI) {
      alert('Please set your API key in the settings.');
      return;
    }

    const localResults = allTabsCache.filter(tab => 
      tab.title?.toLowerCase().includes(query.toLowerCase())
    );
    renderTabs(localResults);

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Based on the search query "${query}", suggest the top 3 most relevant websites. For each, provide a title and a valid URL. Format the output as a JSON array of objects, where each object has "title" and "url" keys.`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().replace(/```json|```/g, '').trim();
      const suggestions = JSON.parse(responseText);

      if (suggestions && suggestions.length > 0) {
        const suggestionsTitle = document.createElement('h3');
        suggestionsTitle.className = 'search-results-title';
        suggestionsTitle.textContent = 'Top Web Suggestions';
        ui.tabGroupsContainer.appendChild(suggestionsTitle);

        const webResultsList = document.createElement('ul');
        webResultsList.className = 'tab-list';

        suggestions.forEach((site: { title: string, url: string }) => {
          const tabItem = document.createElement('li');
          tabItem.className = 'tab-item';
          const domain = new URL(site.url).hostname;
          
          tabItem.innerHTML = `
            <div class="tab-link">
              <img class="favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" />
              <span class="tab-item-title">${site.title}</span>
            </div>
          `;
          tabItem.addEventListener('click', () => {
            chrome.tabs.create({ url: site.url });
          });
          webResultsList.appendChild(tabItem);
        });
        ui.tabGroupsContainer.appendChild(webResultsList);
      }
    } catch (error) {
      console.error("Error fetching web suggestions:", error);
    }
  }

  async function processQueue() {
    isQueueProcessing = true;
    if (imageQueue.length === 0) {
      isQueueProcessing = false;
      ui.scrapeButton.classList.remove('hidden');
      ui.stopButton.classList.add('hidden');
      if (ui.progressContainer) {
        setTimeout(() => ui.progressContainer.classList.add('hidden'), 500);
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
          estimatedCost += (result.tokens / 1000) * pricing.output;
        }
        if (ui.tokenCountSpan && ui.costEstimateSpan) {
          ui.tokenCountSpan.textContent = totalTokens.toString();
          ui.costEstimateSpan.textContent = estimatedCost.toFixed(6);
        }
      }
    }

    if (ui.progressBar) {
      const progress = (totalImages - imageQueue.length) / totalImages * 100;
      ui.progressBar.style.width = `${progress}%`;
    }

    if (isQueueProcessing) {
      setTimeout(processQueue, 2000);
    }
  }

  async function generatePrompt(image: { src: string; base64: string; mimeType: string }, modelName: string): Promise<{ prompt: string, tokens: number } | null> {
    if (!genAI) return { prompt: "API key not set.", tokens: 0 };
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const customPrompt = ui.customPromptTextarea.value || 'Generate a text-to-image AI prompt that can recreate it accurately.';
      const imagePart = { inlineData: { data: image.base64, mimeType: image.mimeType } };
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
      resultItem.innerHTML = `
        <img src="${imageUrl}" />
        <p>${prompt}</p>
      `;
      ui.resultsList.appendChild(resultItem);
    }
  }

  function setActiveView(viewName: string) {
    ui.views.forEach(view => {
      view.id === `${viewName}-view` ? view.classList.remove('hidden') : view.classList.add('hidden');
    });

    ui.menuItems.forEach(i => i.classList.remove('active'));
    const newActiveItem = document.querySelector(`.menu-item[data-view="${viewName}"]`);
    if (newActiveItem) {
      newActiveItem.classList.add('active');
      const parentDropdown = newActiveItem.closest('.dropdown');
      if (parentDropdown) {
        parentDropdown.querySelector('.menu-item')?.classList.add('active');
      }
    }

    if (viewName === 'tabs') {
      chrome.tabs.query({}, (tabs) => {
        allTabsCache = tabs;
        renderTabs();
      });
    }
  }

  // --- INITIALIZATION & EVENT LISTENERS ---

  chrome.storage.sync.get(['darkMode', 'aiModel', 'apiKey', 'customPrompt', 'defaultTool'], (data) => {
    if (data.darkMode) {
      ui.body.classList.add('dark-mode');
      ui.darkModeToggle.checked = true;
    }
    if (data.aiModel) ui.aiModelSelect.value = data.aiModel;
    if (data.apiKey) {
      ui.apiKeyInput.value = data.apiKey;
      genAI = new GoogleGenerativeAI(data.apiKey);
    }
    if (data.customPrompt) ui.customPromptTextarea.value = data.customPrompt;
    if (data.defaultTool) {
      ui.defaultToolSelect.value = data.defaultTool;
      setActiveView(data.defaultTool);
    } else {
      // Default to Tab Manager on first install
      setActiveView('tabs');
    }
  });

  ui.darkModeToggle.addEventListener('change', () => {
    ui.body.classList.toggle('dark-mode');
    chrome.storage.sync.set({ darkMode: ui.darkModeToggle.checked });
  });

  ui.menuItems.forEach(item => {
    if (item.id === 'tools-menu') {
      item.addEventListener('click', (e) => e.preventDefault());
      return;
    }
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const viewName = (item as HTMLElement).dataset.view;
      if (viewName) setActiveView(viewName);
    });
  });

  ui.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const aiModel = ui.aiModelSelect.value;
    const apiKey = ui.apiKeyInput.value;
    const customPrompt = ui.customPromptTextarea.value;
    const defaultTool = ui.defaultToolSelect.value;
    chrome.storage.sync.set({ aiModel, apiKey, customPrompt, defaultTool }, () => {
      if (apiKey) genAI = new GoogleGenerativeAI(apiKey);
      alert('Settings saved!');
    });
  });

  ui.scrapeButton.addEventListener('click', () => {
    if (!genAI) {
      alert('Please set your API key in the settings.');
      return;
    }
    ui.scrapeButton.classList.add('hidden');
    ui.stopButton.classList.remove('hidden');
    if (ui.resultsList) ui.resultsList.innerHTML = '';
    if (ui.usageContainer) ui.usageContainer.classList.remove('hidden');
    totalTokens = 0;
    estimatedCost = 0;
    if (ui.progressContainer && ui.progressBar) {
      ui.progressContainer.classList.remove('hidden');
      ui.progressBar.style.width = '0%';
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['content.js'] }, () => {
          chrome.tabs.sendMessage(tabs[0].id!, { action: 'scrapeImages' }, (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error messaging content script:", chrome.runtime.lastError.message);
              // Optionally, inform the user that the page might need reloading
              alert("Could not connect to the page. Please reload the tab and try again.");
              ui.scrapeButton.classList.remove('hidden');
              ui.stopButton.classList.add('hidden');
              return;
            }
            imageQueue = response;
            totalImages = response.length;
            if (!isQueueProcessing) processQueue();
          });
        });
      }
    });
  });

  ui.stopButton.addEventListener('click', () => {
    imageQueue = [];
    isQueueProcessing = false;
    ui.scrapeButton.classList.remove('hidden');
    ui.stopButton.classList.add('hidden');
    if (ui.progressContainer) ui.progressContainer.classList.add('hidden');
  });

  ui.expandAllBtn.addEventListener('click', () => {
    ui.tabGroupsContainer.querySelectorAll('.tab-group').forEach(group => group.classList.remove('collapsed'));
  });

  ui.collapseAllBtn.addEventListener('click', () => {
    ui.tabGroupsContainer.querySelectorAll('.tab-group').forEach(group => group.classList.add('collapsed'));
  });

  ui.tabGroupsContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const tabDataMap = (ui.tabGroupsContainer as any)._tabDataMap as Map<string, chrome.tabs.Tab>;

    const summaryButton = target.closest('.ai-summary-button');
    const closeButton = target.closest('.close-tab-button');
    const tabLink = target.closest('.tab-link');

    if (summaryButton) {
      const tabId = summaryButton.getAttribute('data-tab-id');
      if (tabId && tabDataMap) {
        const tab = tabDataMap.get(tabId);
        if (tab) getTabSummary(tab, summaryButton as HTMLButtonElement);
      }
    } else if (closeButton) {
      const tabId = closeButton.getAttribute('data-tab-id');
      if (tabId) chrome.tabs.remove(parseInt(tabId, 10));
    } else if (tabLink) {
      const tabItem = tabLink.closest('.tab-item');
      const tabId = tabItem?.getAttribute('data-tab-id');
      if (tabId && tabDataMap) {
        const tab = tabDataMap.get(tabId);
        if (tab && tab.id) {
          chrome.tabs.update(tab.id, { active: true });
          if (tab.windowId) chrome.windows.update(tab.windowId, { focused: true });
        }
      }
    }
  });

  let searchTimeout: number;
  ui.tabSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
      performSearch(ui.tabSearchInput.value);
    }, 300); // Debounce search
  });

  function refreshTabs() {
    if (isTabsViewActive()) {
      chrome.tabs.query({}, (tabs) => {
        allTabsCache = tabs;
        renderTabs();
      });
    }
  }

  chrome.tabs.onCreated.addListener(refreshTabs);
  chrome.tabs.onRemoved.addListener(refreshTabs);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.title) {
      refreshTabs();
    }
  });
});