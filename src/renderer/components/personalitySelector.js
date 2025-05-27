// src/renderer/components/personalitySelector.js

// Assume Swiper and particlesJS are loaded globally or imported if using modules
// import Swiper from 'swiper'; // Example if using modules
// import 'swiper/swiper-bundle.css'; // Example if using modules
// import particlesJS from 'particles.js'; // Example if using modules

// Load the HTML component
async function loadComponent() {
    try {
        const response = await fetch('./components/personalitySelector.html');
        if (!response.ok) {
            throw new Error(`Failed to load component: ${response.status}`);
        }
        const html = await response.text();
        
        // Create a temporary container to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Append all elements to the body
        while (tempDiv.firstChild) {
            document.body.appendChild(tempDiv.firstChild);
        }
        
        console.log('[PersonalitySelector] Component HTML loaded successfully');
        return true;
    } catch (error) {
        console.error('[PersonalitySelector] Failed to load component HTML:', error);
        return false;
    }
}

let swiperInstance = null;
let personalities = [];
let allPersonalities = []; // Store all personalities including disabled ones
let availableModels = [];
let availableContextSets = [];
let availableTools = ['MakeNote', 'CreateEvent', 'CheckEvents', 'startTimer', 'createNotification', 'createAlarm']; // Default tools
let onSelectCallback = null; // Callback to notify app.js
let currentEditingPersonality = null; // For edit mode

// DOM elements (will be set after component loads)
let selectorOverlay = null;
let carouselWrapper = null;
let closeButton = null;
let settingsBtn = null;
let settingsDropdown = null;
let createNewBtn = null;
let personalityAvailabilityList = null;

// Editor modal elements
let editorOverlay = null;
let editorTitle = null;
let closeEditorBtn = null;
let cancelEditorBtn = null;
let savePersonalityBtn = null;
let editorForm = null;

// Form elements
let nameInput = null;
let descriptionInput = null;
let iconInput = null;
let promptInput = null;
let modelSelect = null;
let customInstructionsInput = null;
let availableContextSetsDiv = null;
let defaultContextSetsDiv = null;
let personalityToolsDiv = null;
let browseIconBtn = null;
let browseContextFilesBtn = null;

function initSwiper() {
    if (swiperInstance) {
        swiperInstance.destroy(true, true); // Destroy existing instance if re-initializing
    }
    // Swiper Initialization (adjust options as needed)
    swiperInstance = new Swiper('#personality-carousel', {
        // Optional parameters
        slidesPerView: 1,
        spaceBetween: 30,
        loop: false, // Loop might be complex with dynamic content, consider carefully
        centeredSlides: true,
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        },
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
        breakpoints: {
            // when window width is >= 640px
            640: {
                slidesPerView: 2,
                spaceBetween: 20
            },
            // when window width is >= 768px
            768: {
                slidesPerView: 3,
                spaceBetween: 30
            }
        }
    });
}

function initParticles() {
    // particles.js Initialization (example configuration)
    // You'll need to customize the particles.json configuration
    // or provide the config object directly here.
    // Example: particlesJS.load('particles-js', 'path/to/particles.json', function() {
    // console.log('callback - particles.js config loaded');
    // });
    // Or direct config:
    particlesJS('particles-js', {
        "particles": {
            "number": {
                "value": 80,
                "density": {
                    "enable": true,
                    "value_area": 800
                }
            },
            "color": {
                "value": "#ffffff"
            },
            "shape": {
                "type": "circle",
            },
            "opacity": {
                "value": 0.5,
                "random": false,
            },
            "size": {
                "value": 3,
                "random": true,
            },
            "line_linked": {
                "enable": true,
                "distance": 150,
                "color": "#ffffff",
                "opacity": 0.4,
                "width": 1
            },
            "move": {
                "enable": true,
                "speed": 2, // Slower speed
                "direction": "none",
                "random": false,
                "straight": false,
                "out_mode": "out",
                "bounce": false,
            }
        },
        "interactivity": {
            "detect_on": "canvas",
            "events": {
                "onhover": {
                    "enable": true,
                    "mode": "repulse"
                },
                "onclick": {
                    "enable": true,
                    "mode": "push"
                },
                "resize": true
            },
            "modes": {
                "repulse": {
                    "distance": 100,
                    "duration": 0.4
                },
                "push": {
                    "particles_nb": 4
                }
            }
        },
        "retina_detect": true
    });
}

function populateCarousel() {
    if (!carouselWrapper) return;
    carouselWrapper.innerHTML = ''; // Clear existing slides

    // Only show enabled personalities
    const enabledPersonalities = personalities.filter(p => !p.disabled);

    enabledPersonalities.forEach(p => {
        const slide = document.createElement('div');
        slide.classList.add('swiper-slide');
        slide.dataset.personalityId = p.id; // Store ID for selection

        // Add edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'personality-edit-btn';
        editBtn.title = 'Edit personality';
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            openPersonalityEditor(p);
        };
        slide.appendChild(editBtn);

        // Create a container for the icon and name
        const headerDiv = document.createElement('div');
        headerDiv.classList.add('personality-item-header');

        // Create and add the icon image if available
        if (p.icon) {
            const iconImg = document.createElement('img');
            // Adjust path: Remove 'src/renderer/' prefix assuming index.html is in src/renderer/
            const relativePath = p.icon.startsWith('src/renderer/') ? p.icon.substring('src/renderer/'.length) : p.icon;
            iconImg.src = relativePath;
            iconImg.alt = `${p.name} icon`; // Add alt text for accessibility
            iconImg.classList.add('personality-icon'); // Add class for styling
            headerDiv.appendChild(iconImg); // Append icon to header
        }

        const nameDiv = document.createElement('div');
        nameDiv.classList.add('personality-name');
        nameDiv.textContent = p.name;
        headerDiv.appendChild(nameDiv); // Append name to header

        const descDiv = document.createElement('div');
        descDiv.classList.add('personality-description');
        descDiv.textContent = p.description;

        slide.appendChild(headerDiv); // Append header (icon + name)
        slide.appendChild(descDiv); // Append description

        slide.addEventListener('click', (e) => {
            // Don't trigger selection if edit button was clicked
            if (e.target.closest('.personality-edit-btn')) return;
            handlePersonalitySelect(p.id);
        });

        carouselWrapper.appendChild(slide);
    });

    // Update Swiper after adding slides
    if (swiperInstance) {
        swiperInstance.update();
    } else {
        initSwiper(); // Initialize if not already done
    }
}

function populateSettingsDropdown() {
    if (!personalityAvailabilityList) return;
    
    personalityAvailabilityList.innerHTML = '';

    allPersonalities.forEach(p => {
        const item = document.createElement('div');
        item.className = 'personality-availability-item';

        const info = document.createElement('div');
        info.className = 'personality-availability-info';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !p.disabled;
        checkbox.onchange = () => togglePersonalityAvailability(p.id, checkbox.checked);

        const label = document.createElement('span');
        label.textContent = p.name;

        info.appendChild(checkbox);
        info.appendChild(label);

        const actions = document.createElement('div');
        actions.className = 'personality-availability-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-personality-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deletePersonality(p.id);

        actions.appendChild(deleteBtn);
        item.appendChild(info);
        item.appendChild(actions);
        personalityAvailabilityList.appendChild(item);
    });
}

async function loadPersonalities() {
    try {
        const result = await window.electronAPI.invoke('get-personalities');
        allPersonalities = (result && Array.isArray(result.personalities)) ? result.personalities : [];
        personalities = allPersonalities.filter(p => !p.disabled);
        populateCarousel();
        populateSettingsDropdown();
    } catch (error) {
        console.error("Failed to load personalities:", error);
        allPersonalities = [];
        personalities = [];
    }
}

async function loadModels() {
    try {
        const config = await window.electronAPI.invoke('get-config');
        availableModels = config?.availableModels || [];
        populateModelSelect();
    } catch (error) {
        console.error("Failed to load models:", error);
        availableModels = [];
    }
}

async function loadContextSets() {
    try {
        const result = await window.electronAPI.invoke('get-context-sets');
        availableContextSets = result?.contextSets || [];
        populateContextSets();
    } catch (error) {
        console.error("Failed to load context sets:", error);
        availableContextSets = [];
    }
}

function populateModelSelect() {
    if (!modelSelect) return;
    
    modelSelect.innerHTML = '';
    
    availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
    });
}

function populateContextSets() {
    if (!availableContextSetsDiv || !defaultContextSetsDiv) return;
    
    availableContextSetsDiv.innerHTML = '';
    defaultContextSetsDiv.innerHTML = '';
    
    availableContextSets.forEach(contextSet => {
        // Available context sets
        const availableItem = document.createElement('div');
        availableItem.className = 'context-item';
        
        const availableCheckbox = document.createElement('input');
        availableCheckbox.type = 'checkbox';
        availableCheckbox.id = `available-${contextSet.id}`;
        availableCheckbox.value = contextSet.id;
        
        const availableLabel = document.createElement('label');
        availableLabel.htmlFor = `available-${contextSet.id}`;
        availableLabel.textContent = contextSet.name;
        
        // Add file type indicator for user-uploaded files
        if (contextSet.type === 'user-uploaded') {
            availableLabel.innerHTML += ' <span class="file-type-indicator">(uploaded)</span>';
        }
        
        availableItem.appendChild(availableCheckbox);
        availableItem.appendChild(availableLabel);
        
        // Add delete button for user-uploaded files
        if (contextSet.type === 'user-uploaded') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-context-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Delete this file';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete "${contextSet.name}"?`)) {
                    try {
                        const result = await window.electronAPI.invoke('delete-context-file', contextSet.id);
                        if (result.success) {
                            await loadContextSets(); // Refresh the list
                        } else {
                            alert('Error deleting file: ' + result.error);
                        }
                    } catch (error) {
                        alert('Error deleting file: ' + error.message);
                    }
                }
            };
            availableItem.appendChild(deleteBtn);
        }
        
        availableContextSetsDiv.appendChild(availableItem);
        
        // Default context sets
        const defaultItem = document.createElement('div');
        defaultItem.className = 'context-item';
        
        const defaultCheckbox = document.createElement('input');
        defaultCheckbox.type = 'checkbox';
        defaultCheckbox.id = `default-${contextSet.id}`;
        defaultCheckbox.value = contextSet.id;
        
        const defaultLabel = document.createElement('label');
        defaultLabel.htmlFor = `default-${contextSet.id}`;
        defaultLabel.textContent = contextSet.name;
        
        // Add file type indicator for user-uploaded files
        if (contextSet.type === 'user-uploaded') {
            defaultLabel.innerHTML += ' <span class="file-type-indicator">(uploaded)</span>';
        }
        
        defaultItem.appendChild(defaultCheckbox);
        defaultItem.appendChild(defaultLabel);
        defaultContextSetsDiv.appendChild(defaultItem);
    });
}

function populateTools() {
    if (!personalityToolsDiv) return;
    
    personalityToolsDiv.innerHTML = '';
    
    availableTools.forEach(tool => {
        const item = document.createElement('div');
        item.className = 'tool-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `tool-${tool}`;
        checkbox.value = tool;
        
        const label = document.createElement('label');
        label.htmlFor = `tool-${tool}`;
        label.textContent = tool;
        
        item.appendChild(checkbox);
        item.appendChild(label);
        personalityToolsDiv.appendChild(item);
    });
}

function handlePersonalitySelect(personalityId) {
    console.log(`Personality selected: ${personalityId}`);
    if (onSelectCallback) {
        onSelectCallback(personalityId); // Notify the main app
    }
    hide(); // Close the selector
}

function toggleSettingsDropdown() {
    if (!settingsDropdown || !settingsBtn) return;
    
    const isHidden = settingsDropdown.classList.contains('hidden');
    if (isHidden) {
        // Calculate position based on settings button
        const btnRect = settingsBtn.getBoundingClientRect();
        const dropdownWidth = 300; // min-width from CSS
        
        // Position below the button, aligned to the right edge
        const left = Math.max(10, btnRect.right - dropdownWidth); // Ensure it doesn't go off-screen
        const top = btnRect.bottom + 5; // 5px gap below button
        
        settingsDropdown.style.left = `${left}px`;
        settingsDropdown.style.top = `${top}px`;
        
        settingsDropdown.classList.remove('hidden');
        populateSettingsDropdown(); // Refresh on open
    } else {
        settingsDropdown.classList.add('hidden');
    }
}

async function togglePersonalityAvailability(personalityId, enabled) {
    try {
        const result = await window.electronAPI.invoke('toggle-personality-availability', {
            personalityId,
            enabled
        });
        
        if (result?.success) {
            // Update local state
            const personality = allPersonalities.find(p => p.id === personalityId);
            if (personality) {
                personality.disabled = !enabled;
            }
            
            // Refresh personalities and carousel
            personalities = allPersonalities.filter(p => !p.disabled);
            populateCarousel();
        } else {
            console.error('Failed to toggle personality availability:', result?.error);
            // Revert checkbox state
            const checkbox = document.querySelector(`input[type="checkbox"][onchange*="${personalityId}"]`);
            if (checkbox) checkbox.checked = !enabled;
        }
    } catch (error) {
        console.error('Error toggling personality availability:', error);
    }
}

async function deletePersonality(personalityId) {
    if (!confirm('Are you sure you want to delete this personality? This action cannot be undone.')) {
        return;
    }
    
    try {
        const result = await window.electronAPI.invoke('delete-personality', personalityId);
        
        if (result?.success) {
            // Remove from local state
            allPersonalities = allPersonalities.filter(p => p.id !== personalityId);
            personalities = personalities.filter(p => p.id !== personalityId);
            
            // Refresh UI
            populateCarousel();
            populateSettingsDropdown();
        } else {
            console.error('Failed to delete personality:', result?.error);
            alert('Failed to delete personality: ' + (result?.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting personality:', error);
        alert('Error deleting personality: ' + error.message);
    }
}

function openPersonalityEditor(personality = null) {
    currentEditingPersonality = personality;
    
    if (personality) {
        // Edit mode
        editorTitle.textContent = 'Edit Personality';
        fillEditorForm(personality);
    } else {
        // Create mode
        editorTitle.textContent = 'Create New Personality';
        clearEditorForm();
    }
    
    // Hide settings dropdown
    settingsDropdown.classList.add('hidden');
    
    // Show editor
    editorOverlay.classList.remove('hidden');
}

function fillEditorForm(personality) {
    nameInput.value = personality.name || '';
    descriptionInput.value = personality.description || '';
    iconInput.value = personality.icon || '';
    modelSelect.value = personality.modelId || '';
    customInstructionsInput.value = personality.customInstructions || '';
    
    // Load prompt content (this would need an IPC call to read the prompt file)
    loadPromptContent(personality.promptId);
    
    // Set context sets
    if (personality.availableContextSetIds) {
        personality.availableContextSetIds.forEach(id => {
            const checkbox = document.getElementById(`available-${id}`);
            if (checkbox) checkbox.checked = true;
        });
    }
    
    if (personality.defaultContextSetIds) {
        personality.defaultContextSetIds.forEach(id => {
            const checkbox = document.getElementById(`default-${id}`);
            if (checkbox) checkbox.checked = true;
        });
    }
    
    // Set tools
    if (personality.tools) {
        personality.tools.forEach(tool => {
            const checkbox = document.getElementById(`tool-${tool}`);
            if (checkbox) checkbox.checked = true;
        });
    }
}

function clearEditorForm() {
    editorForm.reset();
    
    // Clear all checkboxes
    const checkboxes = editorForm.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
}

async function loadPromptContent(promptId) {
    if (!promptId) {
        promptInput.value = '';
        return;
    }
    
    try {
        const result = await window.electronAPI.invoke('get-prompt-content', promptId);
        if (result?.success) {
            promptInput.value = result.content || '';
        } else {
            console.error('Failed to load prompt content:', result?.error);
            promptInput.value = '';
        }
    } catch (error) {
        console.error('Error loading prompt content:', error);
        promptInput.value = '';
    }
}

function closePersonalityEditor() {
    editorOverlay.classList.add('hidden');
    currentEditingPersonality = null;
    clearEditorForm();
}

async function savePersonality() {
    const formData = new FormData(editorForm);
    
    // Collect form data
    const personalityData = {
        name: nameInput.value.trim(),
        description: descriptionInput.value.trim(),
        icon: iconInput.value.trim(),
        modelId: modelSelect.value,
        customInstructions: customInstructionsInput.value.trim(),
        promptContent: promptInput.value.trim()
    };
    
    // Validation
    if (!personalityData.name) {
        alert('Please enter a personality name.');
        nameInput.focus();
        return;
    }
    
    if (!personalityData.modelId) {
        alert('Please select an AI model.');
        modelSelect.focus();
        return;
    }
    
    // Collect available context sets
    const availableContextSetIds = [];
    availableContextSetsDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        availableContextSetIds.push(cb.value);
    });
    
    // Collect default context sets
    const defaultContextSetIds = [];
    defaultContextSetsDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        defaultContextSetIds.push(cb.value);
    });
    
    // Collect tools
    const tools = [];
    personalityToolsDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        tools.push(cb.value);
    });
    
    personalityData.availableContextSetIds = availableContextSetIds;
    personalityData.defaultContextSetIds = defaultContextSetIds;
    personalityData.tools = tools;
    
    // Add ID if editing
    if (currentEditingPersonality) {
        personalityData.id = currentEditingPersonality.id;
    }
    
    try {
        const result = await window.electronAPI.invoke('save-personality', personalityData);
        
        if (result?.success) {
            // Refresh personalities
            await loadPersonalities();
            closePersonalityEditor();
        } else {
            console.error('Failed to save personality:', result?.error);
            alert('Failed to save personality: ' + (result?.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving personality:', error);
        alert('Error saving personality: ' + error.message);
    }
}

function show() {
    if (!selectorOverlay) return;
    loadPersonalities(); // Refresh personalities each time it's shown
    selectorOverlay.classList.remove('hidden');
}

function hide() {
    if (!selectorOverlay) return;
    selectorOverlay.classList.add('hidden');
    // Hide settings dropdown if open
    if (settingsDropdown) {
        settingsDropdown.classList.add('hidden');
    }
}

// Update global DOM element references after component is loaded
function updateDOMReferences(selectorOverlayEl, carouselWrapperEl, closeButtonEl, settingsBtnEl, 
                           settingsDropdownEl, createNewBtnEl, personalityAvailabilityListEl, 
                           editorOverlayEl, editorTitleEl, closeEditorBtnEl, cancelEditorBtnEl, 
                           savePersonalityBtnEl, editorFormEl, nameInputEl, descriptionInputEl, 
                           iconInputEl, promptInputEl, modelSelectEl, customInstructionsInputEl,
                           availableContextSetsDivEl, defaultContextSetsDivEl, personalityToolsDivEl,
                           browseIconBtnEl, browseContextFilesBtnEl) {
    // Update global variables
    selectorOverlay = selectorOverlayEl;
    carouselWrapper = carouselWrapperEl;
    closeButton = closeButtonEl;
    settingsBtn = settingsBtnEl;
    settingsDropdown = settingsDropdownEl;
    createNewBtn = createNewBtnEl;
    personalityAvailabilityList = personalityAvailabilityListEl;
    editorOverlay = editorOverlayEl;
    editorTitle = editorTitleEl;
    closeEditorBtn = closeEditorBtnEl;
    cancelEditorBtn = cancelEditorBtnEl;
    savePersonalityBtn = savePersonalityBtnEl;
    editorForm = editorFormEl;
    nameInput = nameInputEl;
    descriptionInput = descriptionInputEl;
    iconInput = iconInputEl;
    promptInput = promptInputEl;
    modelSelect = modelSelectEl;
    customInstructionsInput = customInstructionsInputEl;
    availableContextSetsDiv = availableContextSetsDivEl;
    defaultContextSetsDiv = defaultContextSetsDivEl;
    personalityToolsDiv = personalityToolsDivEl;
    browseIconBtn = browseIconBtnEl;
    browseContextFilesBtn = browseContextFilesBtnEl;
}

async function init(callback) {
    onSelectCallback = callback; // Store the callback function
    
    // First load the component HTML, then initialize
    const success = await loadComponent();
    if (!success) {
        console.error("Personality Selector failed to load component HTML.");
        throw new Error("Failed to load personality selector component HTML");
    }
    
    // Get DOM elements after HTML is loaded
    const selectorOverlay = document.getElementById('personality-selector-overlay');
    const carouselWrapper = document.querySelector('#personality-carousel .swiper-wrapper');
    const closeButton = document.getElementById('close-personality-selector');
    const settingsBtn = document.getElementById('personality-settings-btn');
    const settingsDropdown = document.getElementById('personality-settings-dropdown');
    const createNewBtn = document.getElementById('create-new-personality-btn');
    const personalityAvailabilityList = document.getElementById('personality-availability-list');

    // Editor modal elements
    const editorOverlay = document.getElementById('personality-editor-overlay');
    const editorTitle = document.getElementById('personality-editor-title');
    const closeEditorBtn = document.getElementById('close-personality-editor');
    const cancelEditorBtn = document.getElementById('cancel-personality-editor');
    const savePersonalityBtn = document.getElementById('save-personality');
    const editorForm = document.getElementById('personality-editor-form');

    // Form elements
    const nameInput = document.getElementById('personality-name');
    const descriptionInput = document.getElementById('personality-description');
    const iconInput = document.getElementById('personality-icon');
    const promptInput = document.getElementById('personality-prompt');
    const modelSelect = document.getElementById('personality-model');
    const customInstructionsInput = document.getElementById('personality-custom-instructions');
    const availableContextSetsDiv = document.getElementById('available-context-sets');
    const defaultContextSetsDiv = document.getElementById('default-context-sets');
    const personalityToolsDiv = document.getElementById('personality-tools');
    const browseIconBtn = document.getElementById('browse-icon-btn');
    const browseContextFilesBtn = document.getElementById('browse-context-files-btn');
    
    if (!selectorOverlay || !carouselWrapper || !closeButton) {
        console.error("Personality Selector UI elements not found after loading component.");
        throw new Error("Required personality selector UI elements not found");
    }
    
    // Update global DOM element references
    updateDOMReferences(selectorOverlay, carouselWrapper, closeButton, settingsBtn, settingsDropdown, 
                      createNewBtn, personalityAvailabilityList, editorOverlay, editorTitle, 
                      closeEditorBtn, cancelEditorBtn, savePersonalityBtn, editorForm,
                      nameInput, descriptionInput, iconInput, promptInput, modelSelect,
                      customInstructionsInput, availableContextSetsDiv, defaultContextSetsDiv,
                      personalityToolsDiv, browseIconBtn, browseContextFilesBtn);
    
    // Event listeners
    closeButton.addEventListener('click', hide);
    
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSettingsDropdown();
        });
    }
    
    if (createNewBtn) {
        createNewBtn.addEventListener('click', () => openPersonalityEditor());
    }
    
    if (closeEditorBtn) {
        closeEditorBtn.addEventListener('click', closePersonalityEditor);
    }
    
    if (cancelEditorBtn) {
        cancelEditorBtn.addEventListener('click', closePersonalityEditor);
    }
    
    if (savePersonalityBtn) {
        savePersonalityBtn.addEventListener('click', savePersonality);
    }
    
    if (browseIconBtn) {
        browseIconBtn.addEventListener('click', () => {
            // TODO: Implement file browser for icon selection
            alert('File browser for icons will be implemented later.');
        });
    }
    
    if (browseContextFilesBtn) {
        browseContextFilesBtn.addEventListener('click', async () => {
            try {
                // Open file browser
                const result = await window.electronAPI.invoke('browse-context-files');
                
                if (!result.success) {
                    alert('Error opening file browser: ' + result.error);
                    return;
                }
                
                if (result.files.length === 0) {
                    return; // User cancelled or no files selected
                }
                
                // Show processing message
                browseContextFilesBtn.disabled = true;
                browseContextFilesBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
                
                // Convert and add files
                const conversionResult = await window.electronAPI.invoke('convert-and-add-context-files', result.files);
                
                if (!conversionResult.success) {
                    alert('Error converting files: ' + conversionResult.error);
                    return;
                }
                
                // Show results
                let message = conversionResult.summary;
                if (conversionResult.errors && conversionResult.errors.length > 0) {
                    message += '\n\nErrors:\n' + conversionResult.errors.join('\n');
                }
                
                alert(message);
                
                // Refresh context sets
                await loadContextSets();
                
            } catch (error) {
                console.error('Error in file browser:', error);
                alert('Error: ' + error.message);
            } finally {
                // Restore button state
                browseContextFilesBtn.disabled = false;
                browseContextFilesBtn.innerHTML = '<i class="fas fa-folder-open mr-2"></i>Browse Files';
            }
        });
    }
    
    // Close settings dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (settingsDropdown && !settingsDropdown.contains(e.target) && 
            !settingsBtn.contains(e.target) && 
            !settingsDropdown.classList.contains('hidden')) {
            settingsDropdown.classList.add('hidden');
        }
    });
    
    // Close editor when clicking background
    if (editorOverlay) {
        const editorBackground = editorOverlay.querySelector('.personality-editor-background');
        if (editorBackground) {
            editorBackground.addEventListener('click', closePersonalityEditor);
        }
    }
    
    // Initial setup
    initParticles(); // Init particles once
    loadModels();
    loadContextSets();
    populateTools();
    
    console.log('[PersonalitySelector] Component initialized successfully');
}

// Export functions to be used by app.js
export const personalitySelector = {
    init,
    show,
    hide
};