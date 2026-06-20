// Main app controller (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;

// Import view initializers
import { initializeProducts } from './views/products/index.js';
import { initializeMeasurementUnits } from './views/measurement-units/index.js';

// Navigation configuration
const NAV_ITEMS = [
  { id: 'products', label: 'Productos', view: 'products' },
  { id: 'measurement-units', label: 'Unidades de Medida', view: 'measurement-units' }
];

// View initializers map
const VIEW_INITIALIZERS = {
  'products': initializeProducts,
  'measurement-units': initializeMeasurementUnits
};

/**
 * Initialize navigation
 */
function initializeNavigation() {
  const navContainer = document.getElementById('app-nav-container');
  if (!navContainer) {
    logger.warn('Navigation container not found');
    return;
  }

  // Create navigation buttons
  const navHTML = NAV_ITEMS.map((item) => {
    return `
      <button class="nav-btn flex-1 px-3 sm:px-4 py-3 sm:py-3.5 border-b-2 border-red-600 text-red-600 bg-red-50 font-medium transition-colors uppercase tracking-wider text-xs sm:text-sm font-light" 
              data-view="${item.view}">
        ${item.label}
      </button>
    `;
  }).join('');

  navContainer.innerHTML = navHTML;

  // Setup navigation button handlers
  navContainer.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const viewName = btn.dataset.view;
      if (viewName) {
        switchView(viewName);
      }
    });
  });
}

/**
 * Switch to a specific view
 */
function switchView(viewName) {
  logger.debug('Switching view', { viewName });

  // Hide all views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.add('hidden');
  });

  // Hide and reset any forms or detail views that might be open in products view
  const productForm = document.getElementById('product-form');
  const productDetail = document.getElementById('product-detail');
  const productsList = document.getElementById('products-list');
  const productsHeader = document.querySelector('#products-view .flex.flex-col');
  
  if (productForm) {
    productForm.classList.add('hidden');
  }
  if (productDetail) {
    productDetail.classList.add('hidden');
  }
  
  // Restore display styles for products list and header
  if (productsList) {
    productsList.style.display = '';
  }
  if (productsHeader) {
    productsHeader.style.display = '';
  }

  // Show selected view
  const selectedView = document.getElementById(`${viewName}-view`);
  if (selectedView) {
    selectedView.classList.remove('hidden');
  } else {
    logger.warn('View element not found', { viewName });
  }

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('border-red-600', 'text-red-600', 'bg-red-50', 'font-medium');
    btn.classList.add('border-transparent', 'text-gray-600');
  });

  const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('border-transparent', 'text-gray-600');
    activeBtn.classList.add('border-red-600', 'text-red-600', 'bg-red-50', 'font-medium');
  }

  // Initialize view if initializer exists
  const initializer = VIEW_INITIALIZERS[viewName];
  if (initializer && typeof initializer === 'function') {
    try {
      initializer();
    } catch (error) {
      logger.error('Error initializing view', { viewName, error });
    }
  } else {
    logger.warn('No initializer found for view', { viewName });
  }
}

function initializeAppForUser(user) {
  logger.info('Initializing app for user', { uid: user.uid, email: user.email });
  initializeNavigation();
  switchView('products');
}

(window.NRDCommon?.startApp || function(fn, opts) {
  window.__nrdStartQueue = window.__nrdStartQueue || [];
  window.__nrdStartQueue.push({ onReady: fn, options: opts || {} });
})(initializeAppForUser, { initDelay: 100 });
