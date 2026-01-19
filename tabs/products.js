// Product management

let productsListener = null;
let productsSearchTerm = ''; // Search term for products

// Load products
function loadProducts() {
  logger.debug('Loading products');
  const productsList = document.getElementById('products-list');
  if (!productsList) {
    logger.warn('Products list element not found');
    return;
  }
  
  productsList.innerHTML = '';

  // Remove previous listener
  if (productsListener) {
    logger.debug('Removing previous products listener');
    productsListener(); // Unsubscribe from NRD Data Access listener
    productsListener = null;
  }

  // Listen for products using NRD Data Access
  logger.debug('Setting up products listener');
  productsListener = nrd.products.onValue((products) => {
    logger.debug('Products data received', { count: Array.isArray(products) ? products.length : Object.keys(products || {}).length });
    if (!productsList) return;
    productsList.innerHTML = '';
    
    // Convert to object format if needed (NRD Data Access may return object with IDs as keys or array)
    const productsDict = Array.isArray(products) 
      ? products.reduce((acc, product) => {
          if (product && product.id) {
            acc[product.id] = product;
          }
          return acc;
        }, {})
      : products || {};

    if (Object.keys(productsDict).length === 0) {
      const user = getCurrentUser();
      const isAuthorized = user && user.email === 'yosbany@nrd.com';
      
      productsList.innerHTML = `
        <div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8">
          <p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">No hay productos registrados</p>
          ${isAuthorized ? `
          <button id="auto-init-products" class="px-4 sm:px-6 py-2 bg-red-600 text-white border border-red-600 hover:bg-red-700 transition-colors uppercase tracking-wider text-xs sm:text-sm font-light">
            Cargar Productos por Defecto
          </button>
          ` : ''}
        </div>
      `;
      // Attach event listener to auto-init button
      if (isAuthorized) {
      setTimeout(() => {
        const autoInitBtn = document.getElementById('auto-init-products');
        if (autoInitBtn) {
          autoInitBtn.addEventListener('click', async () => {
            await initializeProducts();
            // The listener will automatically refresh the list
          });
        }
      }, 100);
      }
      return;
    }

    // Filter by search term if active
    let productsToShow = Object.entries(productsDict);
    if (productsSearchTerm.trim()) {
      const searchLower = productsSearchTerm.toLowerCase().trim();
      productsToShow = productsToShow.filter(([id, product]) => {
        const name = product.name ? product.name.toLowerCase() : '';
        const sku = product.sku ? product.sku.toLowerCase() : '';
        const price = product.price ? parseFloat(product.price).toString() : '';
        const priceFormatted = product.price ? parseFloat(product.price).toFixed(2) : '';
        
        return name.includes(searchLower) || 
               sku.includes(searchLower) ||
               price.includes(searchLower) ||
               priceFormatted.includes(searchLower);
      });
    }
    
    if (productsToShow.length === 0) {
      productsList.innerHTML = '<p class="text-center text-gray-600 py-6 sm:py-8 text-sm sm:text-base">No hay productos que coincidan con la búsqueda</p>';
      return;
    }

    productsToShow.forEach(([id, product]) => {
      const item = document.createElement('div');
      item.className = 'border border-gray-200 p-3 sm:p-4 md:p-6 hover:border-red-600 transition-colors cursor-pointer';
      item.dataset.productId = id;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light flex-1">${escapeHtml(product.name)}</div>
          <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${product.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
            ${product.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
        <div class="text-xs sm:text-sm text-gray-600">
          ${product.sku ? `<div class="mb-1">SKU: <span class="font-mono">${escapeHtml(product.sku)}</span></div>` : ''}
          Precio: <span class="text-red-600 font-medium">$${parseFloat(product.price || 0).toFixed(2)}</span>
        </div>
      `;
      item.addEventListener('click', () => viewProduct(id));
      productsList.appendChild(item);
    });
  });
}

// Show product form
function showProductForm(productId = null) {
  const form = document.getElementById('product-form');
  const list = document.getElementById('products-list');
  const header = document.querySelector('#products-view .flex.flex-col');
  const title = document.getElementById('product-form-title');
  const formHeader = document.getElementById('product-form-header');
  const formElement = document.getElementById('product-form-element');
  
  form.classList.remove('hidden');
  if (list) list.style.display = 'none';
  if (header) header.style.display = 'none';
  
  formElement.reset();
  document.getElementById('product-id').value = productId || '';

  const subtitle = document.getElementById('product-form-subtitle');
  const saveBtn = document.getElementById('save-product-btn');
  
  if (productId) {
    title.textContent = 'Editar Producto';
    if (subtitle) subtitle.textContent = 'Modifique la información del producto';
    // Cambiar color del header a azul para edición
    if (formHeader) {
      formHeader.classList.remove('bg-green-600', 'bg-gray-600');
      formHeader.classList.add('bg-blue-600');
    }
    // Cambiar color del botón guardar a azul
    if (saveBtn) {
      saveBtn.classList.remove('bg-green-600', 'border-green-600', 'hover:bg-green-700');
      saveBtn.classList.add('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
    }
    (async () => {
      const product = await nrd.products.getById(productId);
      if (product) {
        document.getElementById('product-name').value = product.name || '';
        document.getElementById('product-sku').value = product.sku || '';
        document.getElementById('product-price').value = product.price || '';
        document.getElementById('product-cost').value = product.cost || '';
        document.getElementById('product-active').checked = product.active !== false;
      }
    })();
  } else {
    title.textContent = 'Nuevo Producto';
    if (subtitle) subtitle.textContent = 'Agregue un nuevo producto al catálogo';
    // Cambiar color del header a verde para nuevo
    if (formHeader) {
      formHeader.classList.remove('bg-blue-600', 'bg-gray-600');
      formHeader.classList.add('bg-green-600');
    }
    // Cambiar color del botón guardar a verde
    if (saveBtn) {
      saveBtn.classList.remove('bg-blue-600', 'border-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600', 'border-green-600', 'hover:bg-green-700');
    }
    document.getElementById('product-active').checked = true;
  }
}

// Hide product form
function hideProductForm() {
  const form = document.getElementById('product-form');
  const list = document.getElementById('products-list');
  const header = document.querySelector('#products-view .flex.flex-col');
  
  form.classList.add('hidden');
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
}

// Save product using NRD Data Access
async function saveProduct(productId, productData) {
  if (productId) {
    await nrd.products.update(productId, productData);
    return { key: productId };
  } else {
    const id = await nrd.products.create(productData);
    return { key: id, getKey: () => id };
  }
}

// View product detail
async function viewProduct(productId) {
  logger.debug('Viewing product', { productId });
  showSpinner('Cargando producto...');
  try {
    const product = await nrd.products.getById(productId);
    hideSpinner();
    if (!product) {
      logger.warn('Product not found', { productId });
      await showError('Producto no encontrado');
      return;
    }
    logger.debug('Product loaded successfully', { productId, name: product.name });

    const list = document.getElementById('products-list');
    const header = document.querySelector('#products-view .flex.flex-col');
    const form = document.getElementById('product-form');
    const detail = document.getElementById('product-detail');
    
    if (list) list.style.display = 'none';
    if (header) header.style.display = 'none';
    if (form) form.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');

    document.getElementById('product-detail-content').innerHTML = `
      <div class="space-y-3 sm:space-y-4">
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
          <span class="text-gray-600 font-light text-sm sm:text-base">Nombre:</span>
          <span class="font-light text-sm sm:text-base">${escapeHtml(product.name)}</span>
        </div>
        ${product.sku ? `
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
          <span class="text-gray-600 font-light text-sm sm:text-base">Código SKU:</span>
          <span class="font-light text-sm sm:text-base font-mono">${escapeHtml(product.sku)}</span>
        </div>
        ` : ''}
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
          <span class="text-gray-600 font-light text-sm sm:text-base">Precio:</span>
          <span class="font-light text-sm sm:text-base text-red-600 font-medium">$${parseFloat(product.price || 0).toFixed(2)}</span>
        </div>
        ${product.cost !== undefined ? `
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
          <span class="text-gray-600 font-light text-sm sm:text-base">Costo:</span>
          <span class="font-light text-sm sm:text-base text-gray-700 font-medium">$${parseFloat(product.cost || 0).toFixed(2)}</span>
        </div>
        ` : ''}
        <div class="flex justify-between py-2 sm:py-3 border-b border-gray-200">
          <span class="text-gray-600 font-light text-sm sm:text-base">Estado:</span>
          <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${product.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
            ${product.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>
    `;

    // Attach button handlers
    const editBtn = document.getElementById('edit-product-detail-btn');
    const deleteBtn = document.getElementById('delete-product-detail-btn');
    
    if (editBtn) {
      editBtn.onclick = () => {
        detail.classList.add('hidden');
        showProductForm(productId);
      };
    }
    
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteProductHandler(productId);
    }
  } catch (error) {
    hideSpinner();
    await showError('Error al cargar producto: ' + error.message);
  }
}

// Back to products list
function backToProducts() {
  const list = document.getElementById('products-list');
  const header = document.querySelector('#products-view .flex.flex-col');
  const detail = document.getElementById('product-detail');
  
  if (list) list.style.display = 'block';
  if (header) header.style.display = 'flex';
  if (detail) detail.classList.add('hidden');
}

// Edit product
function editProduct(productId) {
  showProductForm(productId);
}

// Delete product handler
async function deleteProductHandler(productId) {
  logger.debug('Delete product requested', { productId });
  const confirmed = await showConfirm('Eliminar Producto', '¿Está seguro de eliminar este producto?');
  if (!confirmed) {
    logger.debug('Product deletion cancelled', { productId });
    return;
  }

  const user = getCurrentUser();
  logger.info('Deleting product', { productId });
  showSpinner('Eliminando producto...');
  try {
    await nrd.products.delete(productId);
    logger.audit('ENTITY_DELETE', { entity: 'product', id: productId, uid: user?.uid, email: user?.email, timestamp: Date.now() });
    logger.info('Product deleted successfully', { productId });
    hideSpinner();
    backToProducts();
  } catch (error) {
    hideSpinner();
    logger.error('Failed to delete product', error);
    await showError('Error al eliminar producto: ' + error.message);
  }
}

// Product form submit
const productFormElement = document.getElementById('product-form-element');
if (productFormElement) {
  productFormElement.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const productId = document.getElementById('product-id').value;
  const name = document.getElementById('product-name').value.trim();
  const sku = document.getElementById('product-sku').value.trim();
  const price = parseFloat(document.getElementById('product-price').value);
  const costValue = document.getElementById('product-cost').value.trim();
  const cost = costValue ? parseFloat(costValue) : undefined;
  const active = document.getElementById('product-active').checked;

  if (!name || isNaN(price) || price < 0) {
    await showError('Por favor complete todos los campos correctamente');
    return;
  }

  if (cost !== undefined && (isNaN(cost) || cost < 0)) {
    await showError('El costo debe ser un número válido mayor o igual a 0');
    return;
  }

  showSpinner('Guardando producto...');
  try {
    const productData = { name, price, active };
    if (sku) {
      productData.sku = sku;
    }
    if (cost !== undefined) {
      productData.cost = cost;
    }
    await saveProduct(productId || null, productData);
    hideSpinner();
    hideProductForm();
  } catch (error) {
    hideSpinner();
    await showError('Error al guardar producto: ' + error.message);
  }
  });
}

// Setup event listeners when DOM is ready
function setupProductEventListeners() {
  // Import products button
  const importBtn = document.getElementById('import-products-btn');
  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      await importProductsFromCSV();
    });
  }

  // New product button
  const newProductBtn = document.getElementById('new-product-btn');
  if (newProductBtn) {
    newProductBtn.addEventListener('click', () => {
      showProductForm();
    });
  }

  // Cancel product form
  const cancelBtn = document.getElementById('cancel-product-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideProductForm();
    });
  }

  // Close product form button
  const closeFormBtn = document.getElementById('close-product-form');
  if (closeFormBtn) {
    closeFormBtn.addEventListener('click', () => {
      hideProductForm();
    });
  }
}

// Setup event listeners
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupProductEventListeners);
} else {
  setupProductEventListeners();
}

// Back to products button
const backToProductsBtn = document.getElementById('back-to-products');
if (backToProductsBtn) {
  backToProductsBtn.addEventListener('click', () => {
    backToProducts();
  });
}

// Close product detail button
const closeProductDetailBtn = document.getElementById('close-product-detail-btn');
if (closeProductDetailBtn) {
  closeProductDetailBtn.addEventListener('click', () => {
    backToProducts();
  });
}

// Initialize products module
function initializeProductsModule() {
  logger.debug('Initializing products module');
  loadProducts();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeProductsModule);
} else {
  initializeProductsModule();
}

// Initialize default products
async function initializeProducts() {
  // Check if user is authorized
  const user = getCurrentUser();
  if (!user || user.email !== 'yosbany@nrd.com') {
    await showError('No tienes permisos para inicializar productos');
    return;
  }

  const defaultProducts = [
    { name: "SANDWICH COPETIN - JAMON Y QUESO", price: 13.00 },
    { name: "SANDWICH COPETIN - JAMON Y CHOCLO", price: 13.00 },
    { name: "SANDWICH COPETIN - ATUN Y TOMATE", price: 16.00 },
    { name: "SANDWICH COPETIN - ATUN Y LECHUGA", price: 16.00 },
    { name: "SANDWICH COPETIN - OLIMPICO", price: 16.00 },
    { name: "SANDWICH COPETIN - JAMON Y HUEVO", price: 13.00 },
    { name: "SANDWICH COPETIN - POLLO Y JARDINERA", price: 16.00 },
    { name: "SANDWICH COPETIN - POLLO Y ACEITUNAS", price: 16.00 },
    { name: "SANDWICH COPETIN - LOMITO Y MANTECA", price: 14.00 },
    { name: "SANDWICH COPETIN - BONDIOLA Y MANTECA", price: 14.00 },
    { name: "SANDWICH COPETIN - JAMON Y TOMATE", price: 13.00 },
    { name: "SANDWICH COPETIN - DOBLE QUESO", price: 14.00 },
    { name: "SANDWICH COPETIN - JAMON Y PALMITOS", price: 14.00 },
    { name: "SANDWICH COPETIN - SALAME Y QUESO", price: 13.00 },
    { name: "BOCADITOS DE PIZZA", price: 10.00 },
    { name: "PEBETE - JAMON Y QUESO", price: 10.00 },
    { name: "EMPANADITAS - CARNE", price: 15.00 },
    { name: "EMPANADITAS - POLLO", price: 15.00 },
    { name: "EMPANADITAS - JAMON Y QUESO", price: 15.00 },
    { name: "BOCADITOS DE TARTA - JAMON Y QUESO", price: 16.00 },
    { name: "BOCADITOS DE TARTA - PASCUALINA", price: 14.00 },
    { name: "MEDIALUNITAS - JAMON Y QUESO", price: 15.00 },
    { name: "MEDIALUNITAS - DULCES", price: 13.00 },
    { name: "MEDIALUNITAS - SALADAS", price: 13.00 },
    { name: "ALEMANITAS", price: 15.00 },
    { name: "PAN TORTUGA 65GR", price: 8 },
    { name: "PAN MIÑON BLANDO", price: 4 },
    { name: "PAN MIÑON BLANDO CON SESAMO", price: 5 },
    { name: "PAN DE PANCHO", price: 6 }
  ];

  showSpinner('Inicializando productos...');
  try {
    // Get existing products using NRD Data Access
    const existingProductsArray = await nrd.products.getAll();
    const existingProducts = Array.isArray(existingProductsArray) 
      ? existingProductsArray.reduce((acc, product, index) => {
          acc[index] = product;
          return acc;
        }, {})
      : existingProductsArray || {};
    
    // Create a map of existing products by name (lowercase) to their IDs
    const existingProductsMap = {};
    Object.entries(existingProducts).forEach(([id, product]) => {
      existingProductsMap[product.name.toLowerCase()] = { id, ...product };
    });

    let added = 0;
    let updated = 0;

    for (const product of defaultProducts) {
      const productNameLower = product.name.toLowerCase();
      
      // If product exists, update only the price
      if (existingProductsMap[productNameLower]) {
        await nrd.products.update(existingProductsMap[productNameLower].id, {
          price: product.price
        });
        updated++;
      } else {
        // If product doesn't exist, create it
        await nrd.products.create({
          name: product.name,
          price: product.price,
          active: true
        });
        added++;
      }
    }

    hideSpinner();
    let message = '';
    if (added > 0 && updated > 0) {
      message = `Se agregaron ${added} productos y se actualizaron ${updated} productos existentes.`;
    } else if (added > 0) {
      message = `Se agregaron ${added} productos exitosamente.`;
    } else if (updated > 0) {
      message = `Se actualizaron ${updated} productos existentes.`;
    }
    
    if (message) {
      logger.info('Products initialization completed', { added, updated });
      await showSuccess(message);
    } else {
      logger.info('Products initialization completed: no changes', { added, updated });
    }
  } catch (error) {
    hideSpinner();
    logger.error('Failed to initialize products', error);
    await showError('Error al inicializar productos: ' + error.message);
  }
}

// Import products from CSV
async function importProductsFromCSV() {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = 'Importar Productos';
    messageEl.innerHTML = `
      <div class="space-y-4">
        <p class="text-sm text-gray-600">Seleccione un archivo CSV con dos columnas: <strong>Artículo</strong> (nombre) y <strong>Contado</strong> (precio)</p>
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Archivo CSV</label>
          <input type="file" id="csv-file-input" accept=".csv" 
            class="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 bg-white text-sm sm:text-base rounded">
        </div>
      </div>
    `;
    
    confirmBtn.textContent = 'Importar';
    cancelBtn.textContent = 'Cancelar';
    confirmBtn.style.display = 'block';

    modal.classList.remove('hidden');

    const handleConfirm = async () => {
      const fileInput = document.getElementById('csv-file-input');
      const file = fileInput?.files[0];
      
      if (!file) {
        await showError('Por favor seleccione un archivo CSV');
        return;
      }

      // Store file reference before showing preview (input will be removed from DOM)
      const selectedFile = file;

      // First, read and preview the CSV
      try {
        const preview = await previewCSVFile(selectedFile);
        if (!preview) {
          // User cancelled or error occurred
          resolve();
          return;
        }
        
        // Show preview and ask for confirmation
        const confirmed = await showCSVPreview(preview);
        if (!confirmed) {
          resolve();
          return;
        }
        
        // Process the CSV file
        modal.classList.add('hidden');
        messageEl.innerHTML = '';
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        modal.removeEventListener('click', handleBackgroundClick);
        
        await processCSVFile(selectedFile, preview);
        resolve();
      } catch (error) {
        await showError('Error al leer el archivo: ' + error.message);
        resolve();
      }
    };

    const handleCancel = () => {
      modal.classList.add('hidden');
      messageEl.innerHTML = '';
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackgroundClick);
      resolve();
    };

    // Close on background click
    const handleBackgroundClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleBackgroundClick);
  });
}

// Preview CSV file (read and parse without importing)
async function previewCSVFile(file) {
  try {
    const text = await readFileAsText(file);
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      await showError('El archivo CSV está vacío');
      return null;
    }

    // Parse CSV (assuming semicolon separator and first line is header)
    const header = lines[0].split(';').map(h => h.trim());
    const articuloIndex = header.findIndex(h => h.toLowerCase() === 'artículo');
    const contadoIndex = header.findIndex(h => h.toLowerCase() === 'contado');

    if (articuloIndex === -1 || contadoIndex === -1) {
      await showError('El CSV debe tener las columnas "Artículo" y "Contado"');
      return null;
    }

    // Get existing products to check which will be updated vs created using NRD Data Access
    const existingProductsArray = await nrd.products.getAll();
    const existingProducts = Array.isArray(existingProductsArray) 
      ? existingProductsArray.reduce((acc, product, index) => {
          acc[index] = product;
          return acc;
        }, {})
      : existingProductsArray || {};
    
    // Create a map of existing products by name (exact match)
    const existingProductsMap = {};
    Object.entries(existingProducts).forEach(([id, product]) => {
      existingProductsMap[product.name] = { id, ...product };
    });

    const products = [];
    const errors = [];

    // Process each line (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(';').map(col => col.trim());
      const name = columns[articuloIndex];
      const priceStr = columns[contadoIndex];

      if (!name) {
        errors.push(`Línea ${i + 1}: Nombre de producto vacío`);
        continue;
      }

      const price = parseFloat(priceStr);
      if (isNaN(price) || price < 0) {
        errors.push(`Línea ${i + 1}: Precio inválido para "${name}"`);
        continue;
      }

      const exists = !!existingProductsMap[name];
      const currentPrice = exists ? parseFloat(existingProductsMap[name].price) : null;
      const priceEqual = exists && currentPrice !== null && parseFloat(price) === currentPrice;
      
      products.push({
        name,
        price,
        exists,
        priceEqual
      });
    }

    const toCreate = products.filter(p => !p.exists).length;
    const toUpdateEqual = products.filter(p => p.exists && p.priceEqual).length;
    const toUpdateDifferent = products.filter(p => p.exists && !p.priceEqual).length;
    
    return {
      products,
      errors,
      total: products.length,
      toCreate,
      toUpdate: toUpdateEqual + toUpdateDifferent,
      toUpdateEqual,
      toUpdateDifferent
    };
  } catch (error) {
    logger.error('Error previewing CSV', error);
    await showError('Error al leer el archivo CSV: ' + error.message);
    return null;
  }
}

// Show CSV preview modal
async function showCSVPreview(preview) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = 'Vista Previa de Importación';
    
    let previewHTML = `
      <div class="space-y-4">
        <div class="text-sm text-gray-600">
          <p><strong>Total de productos:</strong> ${preview.total}</p>
          <p><strong>Nuevos:</strong> <span class="text-blue-600">${preview.toCreate}</span></p>
          <p><strong>Actualizaciones (precio igual):</strong> <span class="text-green-600">${preview.toUpdateEqual}</span></p>
          <p><strong>Actualizaciones (precio diferente):</strong> <span class="text-orange-600">${preview.toUpdateDifferent}</span></p>
        </div>
    `;
    
    if (preview.errors.length > 0) {
      previewHTML += `
        <div class="border border-red-200 bg-red-50 p-3 rounded">
          <p class="text-xs font-medium text-red-600 mb-2">Errores encontrados (${preview.errors.length}):</p>
          <ul class="text-xs text-red-600 space-y-1 max-h-32 overflow-y-auto">
            ${preview.errors.slice(0, 10).map(err => `<li>${escapeHtml(err)}</li>`).join('')}
            ${preview.errors.length > 10 ? `<li>... y ${preview.errors.length - 10} errores más</li>` : ''}
          </ul>
        </div>
      `;
    }
    
    previewHTML += `
        <div class="border border-gray-200 rounded max-h-60 overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left text-xs uppercase tracking-wider text-gray-600 border-b">Nombre</th>
                <th class="px-3 py-2 text-left text-xs uppercase tracking-wider text-gray-600 border-b">Precio</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
    `;
    
    // Show first 20 products
    const productsToShow = preview.products.slice(0, 20);
    productsToShow.forEach(product => {
      let priceClass = '';
      if (!product.exists) {
        // Nuevo producto - azul
        priceClass = 'text-blue-600';
      } else if (product.priceEqual) {
        // Precio igual - verde
        priceClass = 'text-green-600';
      } else {
        // Precio diferente - warning (amarillo/naranja)
        priceClass = 'text-orange-600';
      }
      
      previewHTML += `
        <tr>
          <td class="px-3 py-2">${escapeHtml(product.name)}</td>
          <td class="px-3 py-2 ${priceClass} font-medium">$${parseFloat(product.price).toFixed(2)}</td>
        </tr>
      `;
    });
    
    if (preview.products.length > 20) {
      previewHTML += `
        <tr>
          <td colspan="2" class="px-3 py-2 text-center text-xs text-gray-500">
            ... y ${preview.products.length - 20} productos más
          </td>
        </tr>
      `;
    }
    
    previewHTML += `
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-500">¿Desea continuar con la importación?</p>
      </div>
    `;
    
    messageEl.innerHTML = previewHTML;
    confirmBtn.textContent = 'Importar';
    cancelBtn.textContent = 'Cancelar';
    confirmBtn.style.display = 'block';

    modal.classList.remove('hidden');

    const handleConfirm = () => {
      modal.classList.add('hidden');
      messageEl.innerHTML = '';
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackgroundClick);
      resolve(true);
    };

    const handleCancel = () => {
      modal.classList.add('hidden');
      messageEl.innerHTML = '';
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackgroundClick);
      resolve(false);
    };

    // Close on background click
    const handleBackgroundClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleBackgroundClick);
  });
}

// Process CSV file (actual import)
async function processCSVFile(file, preview) {
  showSpinner('Importando productos...');
  
  try {
    // Get existing products using NRD Data Access
    const existingProductsArray = await nrd.products.getAll();
    const existingProducts = Array.isArray(existingProductsArray) 
      ? existingProductsArray.reduce((acc, product, index) => {
          acc[index] = product;
          return acc;
        }, {})
      : existingProductsArray || {};
    
    // Create a map of existing products by name (exact match)
    const existingProductsMap = {};
    Object.entries(existingProducts).forEach(([id, product]) => {
      existingProductsMap[product.name] = { id, ...product };
    });

    let added = 0;
    let updated = 0;
    const errors = preview.errors || [];

    // Process each product from preview
    for (const product of preview.products) {
      try {
        if (product.exists) {
          // Update only the price
          await nrd.products.update(existingProductsMap[product.name].id, {
            price: product.price
          });
          updated++;
        } else {
          // Create new product
          await nrd.products.create({
            name: product.name,
            price: product.price,
            active: true
          });
          added++;
        }
      } catch (error) {
        errors.push(`Error al procesar "${product.name}": ${error.message}`);
      }
    }

    hideSpinner();
    
    logger.info('CSV import completed', { added, updated, errors: errors.length });
    let message = '';
    if (added > 0 && updated > 0) {
      message = `Se agregaron ${added} productos y se actualizaron ${updated} productos existentes.`;
    } else if (added > 0) {
      message = `Se agregaron ${added} productos exitosamente.`;
    } else if (updated > 0) {
      message = `Se actualizaron ${updated} productos existentes.`;
    } else {
      message = 'No se procesaron productos.';
    }
    
    if (errors.length > 0) {
      logger.warn('CSV import completed with errors', { errorCount: errors.length });
      message += `\n\nErrores encontrados:\n${errors.slice(0, 5).join('\n')}`;
      if (errors.length > 5) {
        message += `\n... y ${errors.length - 5} errores más.`;
      }
    }
    
    if (added > 0 || updated > 0) {
      await showSuccess(message);
    } else {
      await showError(message);
    }
  } catch (error) {
    hideSpinner();
    console.error('Error processing CSV:', error);
    await showError('Error al procesar el archivo CSV: ' + error.message);
  }
}

// Read file as text
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Error al leer el archivo'));
    reader.readAsText(file, 'UTF-8');
  });
}

// Initialize products button
const initProductsBtn = document.getElementById('init-products-btn');
if (initProductsBtn) {
  // Hide button if user is not authorized
  const checkAuthAndShowButton = () => {
    const user = getCurrentUser();
    const isAuthorized = user && user.email === 'yosbany@nrd.com';
    if (isAuthorized) {
      initProductsBtn.classList.remove('hidden');
    } else {
      initProductsBtn.classList.add('hidden');
    }
  };
  
  // Check on load
  checkAuthAndShowButton();
  
  // Listen for auth state changes using NRD Data Access
  nrd.auth.onAuthStateChanged(() => {
    checkAuthAndShowButton();
  });
  
  initProductsBtn.addEventListener('click', () => {
  initializeProducts();
});
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Search input for products
const productsSearchInput = document.getElementById('products-search-input');
if (productsSearchInput) {
  productsSearchInput.addEventListener('input', (e) => {
    productsSearchTerm = e.target.value;
    loadProducts();
  });
}

