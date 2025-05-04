// src/renderer/components/personalitySelector.js

// Assume Swiper and particlesJS are loaded globally or imported if using modules
// import Swiper from 'swiper'; // Example if using modules
// import 'swiper/swiper-bundle.css'; // Example if using modules
// import particlesJS from 'particles.js'; // Example if using modules

let swiperInstance = null;
let personalities = [];
let onSelectCallback = null; // Callback to notify app.js

const selectorOverlay = document.getElementById('personality-selector-overlay');
const carouselWrapper = document.querySelector('#personality-carousel .swiper-wrapper');
const closeButton = document.getElementById('close-personality-selector');

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

    personalities.forEach(p => {
        const slide = document.createElement('div');
        slide.classList.add('swiper-slide');
        slide.dataset.personalityId = p.id; // Store ID for selection

        const nameDiv = document.createElement('div');
        nameDiv.classList.add('personality-name');
        nameDiv.textContent = p.name;
        // console.log(`  Processing personality: ID=${p.id}, Name=${p.name}`); // Debug log removed

        const descDiv = document.createElement('div');
        descDiv.classList.add('personality-description');
        descDiv.textContent = p.description;
        // console.log(`    Description: ${p.description}`); // Debug log removed

        slide.appendChild(nameDiv);
        slide.appendChild(descDiv);

        slide.addEventListener('click', () => handlePersonalitySelect(p.id));

        // console.log('    Generated slide HTML:', slide.outerHTML); // Debug log removed
        carouselWrapper.appendChild(slide);
    });

    // Update Swiper after adding slides
    // console.log('Before Swiper update/init'); // Debug log removed
    if (swiperInstance) {
        swiperInstance.update();
        // console.log('After Swiper update'); // Debug log removed
    } else {
        initSwiper(); // Initialize if not already done
        // console.log('After Swiper init'); // Debug log removed
    }
}

async function loadPersonalities() {
    try {
        // Assuming an IPC call setup like this exists
        const result = await window.electronAPI.invoke('get-personalities');
        // Ensure result and result.personalities exist and is an array
        personalities = (result && Array.isArray(result.personalities)) ? result.personalities : [];
        // console.log('Received personalities:', personalities); // Debug log removed
        populateCarousel();
    } catch (error) {
        console.error("Failed to load personalities:", error);
        // Handle error display if necessary
    }
}

function handlePersonalitySelect(personalityId) {
    console.log(`Personality selected: ${personalityId}`);
    if (onSelectCallback) {
        onSelectCallback(personalityId); // Notify the main app
    }
    hide(); // Close the selector
}

function show() {
    if (!selectorOverlay) return;
    loadPersonalities(); // Refresh personalities each time it's shown
    selectorOverlay.classList.remove('hidden');
    // Re-initialize or ensure particles are running if needed
    // initParticles(); // Might re-init every time, or check if already running
}

function hide() {
    if (!selectorOverlay) return;
    selectorOverlay.classList.add('hidden');
    // Optionally stop particles animation here if resource-intensive
}

function init(callback) {
    if (!selectorOverlay || !carouselWrapper || !closeButton) {
        console.error("Personality Selector UI elements not found.");
        return;
    }
    onSelectCallback = callback; // Store the callback function
    closeButton.addEventListener('click', hide);
    // Initial load and setup
    initParticles(); // Init particles once
    // Don't load personalities here, load when shown
}

// Export functions to be used by app.js
export const personalitySelector = {
    init,
    show,
    hide
};