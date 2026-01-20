// Product management

let productsListener = null;
let productsSearchTerm = ''; // Search term for products

// Helper functions for product variants
/**
 * Obtiene una variante específica de un producto por SKU
 * @param {Product} product - Producto
 * @param {string} variantSku - SKU de la variante
 * @returns {ProductVariant|null}
 */
function getVariantBySku(product, variantSku) {
  if (!product || !product.variants || !variantSku) return null;
  return product.variants.find(v => v.sku === variantSku) || null;
}

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
      const hasVariants = product.variants && product.variants.length > 0;
      const activeVariants = hasVariants ? product.variants.filter(v => v.active !== false).length : 0;
      item.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-2 sm:mb-3">
          <div class="text-base sm:text-lg font-light flex-1">
            ${escapeHtml(product.name)}
            ${hasVariants ? `<span class="ml-2 text-xs text-gray-500">(${activeVariants} variante${activeVariants !== 1 ? 's' : ''})</span>` : ''}
          </div>
          <span class="px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-wider border ${product.active ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
            ${product.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
        <div class="text-xs sm:text-sm text-gray-600">
          ${product.sku ? `<div class="mb-1">SKU: <span class="font-mono">${escapeHtml(product.sku)}</span></div>` : ''}
          ${hasVariants ? `
          <div class="mb-1 text-gray-500 italic">Producto con variantes (precio base: $${parseFloat(product.price || 0).toFixed(2)})</div>
          ` : `
          <div class="mb-1">Precio: <span class="text-red-600 font-medium">$${parseFloat(product.price || 0).toFixed(2)}</span></div>
          `}
          ${product.cost !== undefined ? `<div class="mb-1">Costo: <span class="text-gray-700 font-medium">$${parseFloat(product.cost || 0).toFixed(2)}</span></div>` : ''}
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

  // Clear variants list
  const variantsList = document.getElementById('product-variants-list');
  if (variantsList) variantsList.innerHTML = '';
  
  // Clear purchase units list
  const purchaseUnitsList = document.getElementById('purchase-units-list');
  if (purchaseUnitsList) purchaseUnitsList.innerHTML = '';
  
  // Clear conversions list
  const conversionsList = document.getElementById('conversions-list');
  if (conversionsList) conversionsList.innerHTML = '';

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
        
        // Load roles
        document.getElementById('product-es-vendible').checked = product.esVendible === true;
        document.getElementById('product-es-comprable').checked = product.esComprable === true;
        document.getElementById('product-es-insumo').checked = product.esInsumo === true;
        document.getElementById('product-es-producible').checked = product.esProducible === true;
        
        // Load units
        if (product.unidadVenta) {
          document.getElementById('product-unidad-venta').value = product.unidadVenta;
        }
        if (product.unidadProduccion) {
          document.getElementById('product-unidad-produccion').value = product.unidadProduccion;
        }
        
        // Load purchase units
        if (product.unidadesCompra && Array.isArray(product.unidadesCompra)) {
          for (const purchaseUnit of product.unidadesCompra) {
            await addPurchaseUnitRow(purchaseUnit);
          }
        }
        
        // Load conversions - generate automatically based on units
        // Wait for all units to be loaded, then generate conversions
        setTimeout(() => {
          // Create a map of existing conversions to preserve factors
          const existingConversionsMap = new Map();
          if (product.conversiones && Array.isArray(product.conversiones)) {
            product.conversiones.forEach(conv => {
              const key = `${conv.fromUnit}_${conv.toUnit}`;
              existingConversionsMap.set(key, conv.factor);
            });
          }
          
          // Generate conversions with existing factors preserved
          updateConversionsFromUnits();
          
          // After generation, update factors from existing conversions
          setTimeout(() => {
            const conversionsList = document.getElementById('conversions-list');
            if (conversionsList && existingConversionsMap.size > 0) {
              const rows = conversionsList.querySelectorAll('[data-conversion-id]');
              
              rows.forEach(row => {
                const fromUnit = row.querySelector('.conversion-from')?.value.trim();
                const toUnit = row.querySelector('.conversion-to')?.value.trim();
                const factorInput = row.querySelector('.conversion-factor');
                
                if (fromUnit && toUnit && factorInput) {
                  const key = `${fromUnit}_${toUnit}`;
                  const existingFactor = existingConversionsMap.get(key);
                  if (existingFactor !== undefined) {
                    factorInput.value = parseFloat(existingFactor).toFixed(4);
                    // Trigger preview update
                    const event = new Event('input', { bubbles: true });
                    factorInput.dispatchEvent(event);
                  }
                }
              });
            }
          }, 50);
        }, 200);
        
        // Load variants
        if (variantsList) {
          variantsList.innerHTML = '';
          if (product.variants && Array.isArray(product.variants)) {
            for (const variant of product.variants) {
              await addVariantRow(variant);
            }
          }
        }
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
    // Initialize roles checkboxes to false for new products
    document.getElementById('product-es-vendible').checked = false;
    document.getElementById('product-es-comprable').checked = false;
    document.getElementById('product-es-insumo').checked = false;
    document.getElementById('product-es-producible').checked = false;
    
    // Initialize units to empty
    document.getElementById('product-unidad-venta').value = '';
    document.getElementById('product-unidad-produccion').value = '';
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

    // Load supplier names for purchase units
    const supplierNamesMap = {};
    if (product.unidadesCompra && product.unidadesCompra.length > 0) {
      try {
        const suppliers = await loadSuppliers();
        suppliers.forEach(supplier => {
          supplierNamesMap[supplier.id] = supplier.name;
        });
      } catch (error) {
        logger.error('Failed to load suppliers for detail view', error);
      }
    }

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
        ${(product.esVendible || product.esComprable || product.esInsumo || product.esProducible) ? `
        <div class="py-2 sm:py-3 border-b border-gray-200">
          <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Roles:</div>
          <div class="flex flex-wrap gap-2">
            ${product.esVendible ? '<span class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded border border-green-300">Vendible</span>' : ''}
            ${product.esComprable ? '<span class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded border border-blue-300">Comprable</span>' : ''}
            ${product.esInsumo ? '<span class="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded border border-orange-300">Insumo</span>' : ''}
            ${product.esProducible ? '<span class="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded border border-purple-300">Producible</span>' : ''}
          </div>
        </div>
        ` : ''}
        ${(product.unidadVenta || product.unidadProduccion || (product.unidadesCompra && product.unidadesCompra.length > 0)) ? `
        <div class="py-2 sm:py-3 border-b border-gray-200">
          <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Unidades de Medida:</div>
          <div class="space-y-2 text-sm">
            ${product.unidadVenta ? `
            <div class="flex justify-between">
              <span class="text-gray-600">Venta:</span>
              <span class="font-medium">${escapeHtml(product.unidadVenta)}</span>
            </div>
            ` : ''}
            ${product.unidadProduccion ? `
            <div class="flex justify-between">
              <span class="text-gray-600">Producción:</span>
              <span class="font-medium">${escapeHtml(product.unidadProduccion)}</span>
            </div>
            ` : ''}
            ${product.unidadesCompra && product.unidadesCompra.length > 0 ? `
            <div>
              <span class="text-gray-600">Compra por Proveedor:</span>
              <div class="mt-1 space-y-1">
                ${product.unidadesCompra.map(pu => {
                  const supplierName = supplierNamesMap[pu.supplierId] || `ID: ${pu.supplierId}`;
                  return `<div class="text-xs pl-2">• ${escapeHtml(supplierName)}: <span class="font-medium">${escapeHtml(pu.unidad)}</span></div>`;
                }).join('')}
              </div>
            </div>
            ` : ''}
          </div>
        </div>
        ` : ''}
        ${product.conversiones && product.conversiones.length > 0 ? `
        <div class="py-2 sm:py-3 border-b border-gray-200">
          <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Conversiones:</div>
          <div class="space-y-1">
            ${product.conversiones.map(conv => `
              <div class="text-xs bg-gray-50 p-2 rounded border border-gray-200">
                <span class="font-medium">1 ${escapeHtml(conv.fromUnit)}</span> = 
                <span class="font-medium">${parseFloat(conv.factor).toFixed(4)}</span> 
                <span class="font-medium">${escapeHtml(conv.toUnit)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
        ${product.variants && product.variants.length > 0 ? `
        <div class="py-2 sm:py-3 border-b border-gray-200">
          <div class="text-gray-600 font-light text-sm sm:text-base mb-2">Variantes:</div>
          <div class="space-y-2">
            ${product.variants.map(variant => {
              const variantSku = variant.sku || '';
              const unidadVenta = variant.unidadVenta || product.unidadVenta;
              const unidadProduccion = variant.unidadProduccion || product.unidadProduccion;
              const unidadesCompra = variant.unidadesCompra || product.unidadesCompra;
              const conversiones = variant.conversiones || product.conversiones;
              const esVendible = variant.esVendible !== undefined ? variant.esVendible : product.esVendible;
              const esComprable = variant.esComprable !== undefined ? variant.esComprable : product.esComprable;
              const esInsumo = variant.esInsumo !== undefined ? variant.esInsumo : product.esInsumo;
              const esProducible = variant.esProducible !== undefined ? variant.esProducible : product.esProducible;
              
              return `
                <div class="bg-gray-50 p-2 sm:p-3 rounded border border-gray-200">
                  <div class="flex justify-between items-start mb-1">
                    <span class="font-medium text-sm">${escapeHtml(variant.name)}</span>
                    <span class="px-2 py-0.5 text-xs uppercase tracking-wider border ${variant.active !== false ? 'border-red-600 text-red-600' : 'border-gray-300 text-gray-600'}">
                      ${variant.active !== false ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  ${variantSku ? `
                  <div class="text-xs text-gray-600 mb-1">SKU: <span class="font-mono">${escapeHtml(variantSku)}</span></div>
                  ` : ''}
                  <div class="text-xs text-gray-600">Precio: <span class="text-red-600 font-medium">$${parseFloat(variant.price || 0).toFixed(2)}</span></div>
                  ${variant.cost !== undefined ? `
                  <div class="text-xs text-gray-600">Costo: <span class="text-gray-700 font-medium">$${parseFloat(variant.cost || 0).toFixed(2)}</span></div>
                  ` : ''}
                  ${(unidadVenta || unidadProduccion || (unidadesCompra && unidadesCompra.length > 0)) ? `
                  <div class="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-300">
                    <div class="font-medium mb-1">Unidades:</div>
                    ${unidadVenta ? `<div>Venta: <span class="font-medium">${escapeHtml(unidadVenta)}</span></div>` : ''}
                    ${unidadProduccion ? `<div>Producción: <span class="font-medium">${escapeHtml(unidadProduccion)}</span></div>` : ''}
                    ${unidadesCompra && unidadesCompra.length > 0 ? `
                    <div>Compra: ${unidadesCompra.map(pu => {
                      const supplierName = supplierNamesMap[pu.supplierId] || pu.supplierId;
                      return `<span class="font-medium">${escapeHtml(supplierName)}: ${escapeHtml(pu.unidad)}</span>`;
                    }).join(', ')}</div>
                    ` : ''}
                  </div>
                  ` : ''}
                  ${conversiones && conversiones.length > 0 ? `
                  <div class="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-300">
                    <div class="font-medium mb-1">Conversiones:</div>
                    ${conversiones.map(conv => `
                      <div>1 ${escapeHtml(conv.fromUnit)} = ${parseFloat(conv.factor).toFixed(4)} ${escapeHtml(conv.toUnit)}</div>
                    `).join('')}
                  </div>
                  ` : ''}
                  ${(esVendible || esComprable || esInsumo || esProducible) ? `
                  <div class="text-xs mt-2 pt-2 border-t border-gray-300">
                    <div class="flex flex-wrap gap-1">
                      ${esVendible ? '<span class="px-1.5 py-0.5 bg-green-100 text-green-700 rounded border border-green-300">Vendible</span>' : ''}
                      ${esComprable ? '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded border border-blue-300">Comprable</span>' : ''}
                      ${esInsumo ? '<span class="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded border border-orange-300">Insumo</span>' : ''}
                      ${esProducible ? '<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded border border-purple-300">Producible</span>' : ''}
                    </div>
                  </div>
                  ` : ''}
                </div>
                `;
            }).join('')}
          </div>
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

// Variants management
async function addVariantRow(variant = null) {
  const variantsList = document.getElementById('product-variants-list');
  if (!variantsList) return;
  
  const variantKey = variant ? (variant.sku || variant.name) : Date.now().toString();
  const row = document.createElement('div');
  row.className = 'border border-gray-200 rounded p-3 sm:p-4 bg-gray-50 mb-3';
  row.dataset.variantKey = variantKey;
  
  // Load suppliers for purchase units
  const suppliers = await loadSuppliers();
  const supplierOptions = suppliers.map(supplier => 
    `<option value="${supplier.id}">${escapeHtml(supplier.name)}</option>`
  ).join('');
  
  // Get purchase units HTML for this variant
  let purchaseUnitsHTML = '';
  if (variant && variant.unidadesCompra && variant.unidadesCompra.length > 0) {
    purchaseUnitsHTML = variant.unidadesCompra.map(pu => {
      const supplierName = suppliers.find(s => s.id === pu.supplierId)?.name || pu.supplierId;
      return `
        <div class="flex items-center gap-2 text-xs">
          <span>${escapeHtml(supplierName)}:</span>
          <select class="variant-purchase-unit-unidad border border-gray-300 rounded px-1 py-0.5" data-supplier-id="${pu.supplierId}">
            <option value="">Seleccione...</option>
            ${getUnitOptionsHTML(pu.unidad)}
          </select>
          <button type="button" class="remove-variant-purchase-unit text-red-600 hover:text-red-800" data-supplier-id="${pu.supplierId}">×</button>
        </div>
      `;
    }).join('');
  }
  
  // Get conversions HTML for this variant
  let conversionsHTML = '';
  if (variant && variant.conversiones && variant.conversiones.length > 0) {
    conversionsHTML = variant.conversiones.map(conv => `
      <div class="flex items-center gap-2 text-xs">
        <span>1 ${escapeHtml(conv.fromUnit)} =</span>
        <input type="number" class="variant-conversion-factor border border-gray-300 rounded px-1 py-0.5 w-20" 
          step="0.0001" min="0.0001" value="${parseFloat(conv.factor || 1).toFixed(4)}"
          data-from="${conv.fromUnit}" data-to="${conv.toUnit}">
        <span>${escapeHtml(conv.toUnit)}</span>
        <button type="button" class="remove-variant-conversion text-red-600 hover:text-red-800" 
          data-from="${conv.fromUnit}" data-to="${conv.toUnit}">×</button>
      </div>
    `).join('');
  }
  
  row.innerHTML = `
    <div class="space-y-3">
      <!-- Basic Info Row -->
      <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-end">
        <div class="sm:col-span-3">
          <label class="block text-xs text-gray-600 mb-1">Nombre</label>
          <input type="text" class="variant-name w-full px-2 py-1.5 border border-gray-300 rounded text-sm" 
            value="${variant ? escapeHtml(variant.name) : ''}" 
            placeholder="Ej: Pequeña, Grande, Chocolate" required>
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-600 mb-1">SKU</label>
          <input type="text" class="variant-sku w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" 
            value="${variant ? escapeHtml(variant.sku || '') : ''}" 
            placeholder="SKU completo de la variante">
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-600 mb-1">Precio</label>
          <input type="number" class="variant-price w-full px-2 py-1.5 border border-gray-300 rounded text-sm" 
            step="0.01" min="0" value="${variant ? parseFloat(variant.price || 0).toFixed(2) : ''}" required>
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-600 mb-1">Costo</label>
          <input type="number" class="variant-cost w-full px-2 py-1.5 border border-gray-300 rounded text-sm" 
            step="0.01" min="0" value="${variant ? (variant.cost !== undefined ? parseFloat(variant.cost).toFixed(2) : '') : ''}">
        </div>
        <div class="sm:col-span-2">
          <label class="flex items-center">
            <input type="checkbox" class="variant-active mr-2" ${variant ? (variant.active !== false ? 'checked' : '') : 'checked'}>
            <span class="text-xs text-gray-600">Activa</span>
          </label>
        </div>
        <div class="sm:col-span-1">
          <button type="button" class="remove-variant-btn w-full px-2 py-1.5 text-red-600 hover:bg-red-50 border border-red-600 rounded text-sm transition-colors">
            ×
          </button>
        </div>
      </div>
      
      <!-- Units Row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200">
        <div>
          <label class="block text-xs text-gray-600 mb-1">Unidad Venta</label>
          <select class="variant-unidad-venta w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
            <option value="">Heredar del producto</option>
            ${getUnitOptionsHTML(variant ? variant.unidadVenta : '')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-600 mb-1">Unidad Producción</label>
          <select class="variant-unidad-produccion w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
            <option value="">Heredar del producto</option>
            ${getUnitOptionsHTML(variant ? variant.unidadProduccion : '')}
          </select>
        </div>
      </div>
      
      <!-- Purchase Units Row -->
      <div class="pt-2 border-t border-gray-200">
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs text-gray-600">Unidades de Compra</label>
          <button type="button" class="add-variant-purchase-unit-btn px-2 py-1 text-xs bg-gray-200 text-gray-700 border border-gray-300 rounded hover:bg-gray-300">
            + Agregar
          </button>
        </div>
        <div class="variant-purchase-units-list space-y-1">
          ${purchaseUnitsHTML}
        </div>
      </div>
      
      <!-- Conversions Row -->
      <div class="pt-2 border-t border-gray-200">
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs text-gray-600">Conversiones</label>
          <button type="button" class="add-variant-conversion-btn px-2 py-1 text-xs bg-gray-200 text-gray-700 border border-gray-300 rounded hover:bg-gray-300">
            + Agregar
          </button>
        </div>
        <div class="variant-conversions-list space-y-1">
          ${conversionsHTML}
        </div>
      </div>
      
      <!-- Roles Row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-200">
        <label class="flex items-center">
          <input type="checkbox" class="variant-es-vendible mr-2" ${variant ? (variant.esVendible === true ? 'checked' : '') : ''}>
          <span class="text-xs text-gray-600">Vendible</span>
        </label>
        <label class="flex items-center">
          <input type="checkbox" class="variant-es-comprable mr-2" ${variant ? (variant.esComprable === true ? 'checked' : '') : ''}>
          <span class="text-xs text-gray-600">Comprable</span>
        </label>
        <label class="flex items-center">
          <input type="checkbox" class="variant-es-insumo mr-2" ${variant ? (variant.esInsumo === true ? 'checked' : '') : ''}>
          <span class="text-xs text-gray-600">Insumo</span>
        </label>
        <label class="flex items-center">
          <input type="checkbox" class="variant-es-producible mr-2" ${variant ? (variant.esProducible === true ? 'checked' : '') : ''}>
          <span class="text-xs text-gray-600">Producible</span>
        </label>
      </div>
    </div>
  `;
  
  
  // Remove button handler
  const removeBtn = row.querySelector('.remove-variant-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      row.remove();
    });
  }
  
  // Add variant purchase unit button handler
  const addVariantPurchaseUnitBtn = row.querySelector('.add-variant-purchase-unit-btn');
  if (addVariantPurchaseUnitBtn) {
    addVariantPurchaseUnitBtn.addEventListener('click', async () => {
      await addVariantPurchaseUnitRow(row, suppliers);
    });
  }
  
  // Add variant conversion button handler
  const addVariantConversionBtn = row.querySelector('.add-variant-conversion-btn');
  if (addVariantConversionBtn) {
    addVariantConversionBtn.addEventListener('click', () => {
      addVariantConversionRow(row);
    });
  }
  
  // Remove variant purchase unit handlers
  row.querySelectorAll('.remove-variant-purchase-unit').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.flex').remove();
    });
  });
  
  // Remove variant conversion handlers
  row.querySelectorAll('.remove-variant-conversion').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.flex').remove();
    });
  });
  
  variantsList.appendChild(row);
}

// Add purchase unit row for variant
async function addVariantPurchaseUnitRow(variantRow, suppliers) {
  const purchaseUnitsList = variantRow.querySelector('.variant-purchase-units-list');
  if (!purchaseUnitsList) return;
  
  if (suppliers.length === 0) {
    await showError('No hay proveedores registrados. Debe crear proveedores primero.');
    return;
  }
  
  const supplierOptions = suppliers.map(supplier => 
    `<option value="${supplier.id}">${escapeHtml(supplier.name)}</option>`
  ).join('');
  
  const unitRow = document.createElement('div');
  unitRow.className = 'flex items-center gap-2 text-xs';
  unitRow.innerHTML = `
    <select class="variant-purchase-unit-supplier border border-gray-300 rounded px-1 py-0.5">
      <option value="">Seleccione proveedor...</option>
      ${supplierOptions}
    </select>
    <span>:</span>
    <select class="variant-purchase-unit-unidad border border-gray-300 rounded px-1 py-0.5">
      <option value="">Seleccione...</option>
      ${getUnitOptionsHTML('')}
    </select>
    <button type="button" class="remove-variant-purchase-unit text-red-600 hover:text-red-800">×</button>
  `;
  
  unitRow.querySelector('.remove-variant-purchase-unit').addEventListener('click', () => {
    unitRow.remove();
  });
  
  purchaseUnitsList.appendChild(unitRow);
}

// Add conversion row for variant
function addVariantConversionRow(variantRow) {
  const conversionsList = variantRow.querySelector('.variant-conversions-list');
  if (!conversionsList) return;
  
  const conversionRow = document.createElement('div');
  conversionRow.className = 'flex items-center gap-2 text-xs';
  conversionRow.innerHTML = `
    <span>1</span>
    <select class="variant-conversion-from border border-gray-300 rounded px-1 py-0.5">
      <option value="">De...</option>
      ${getUnitOptionsHTML('')}
    </select>
    <span>=</span>
    <input type="number" class="variant-conversion-factor border border-gray-300 rounded px-1 py-0.5 w-20" 
      step="0.0001" min="0.0001" placeholder="Factor">
    <select class="variant-conversion-to border border-gray-300 rounded px-1 py-0.5">
      <option value="">A...</option>
      ${getUnitOptionsHTML('')}
    </select>
    <button type="button" class="remove-variant-conversion text-red-600 hover:text-red-800">×</button>
  `;
  
  conversionRow.querySelector('.remove-variant-conversion').addEventListener('click', () => {
    conversionRow.remove();
  });
  
  conversionsList.appendChild(conversionRow);
}

function collectVariants() {
  const variantsList = document.getElementById('product-variants-list');
  if (!variantsList) return [];
  
  const variants = [];
  const rows = variantsList.querySelectorAll('[data-variant-key]');
  
  rows.forEach(row => {
    const name = row.querySelector('.variant-name')?.value.trim();
    const sku = row.querySelector('.variant-sku')?.value.trim();
    const priceValue = row.querySelector('.variant-price')?.value.trim();
    const costValue = row.querySelector('.variant-cost')?.value.trim();
    const active = row.querySelector('.variant-active')?.checked;
    
    // Units
    const unidadVenta = row.querySelector('.variant-unidad-venta')?.value.trim();
    const unidadProduccion = row.querySelector('.variant-unidad-produccion')?.value.trim();
    
    // Roles
    const esVendible = row.querySelector('.variant-es-vendible')?.checked;
    const esComprable = row.querySelector('.variant-es-comprable')?.checked;
    const esInsumo = row.querySelector('.variant-es-insumo')?.checked;
    const esProducible = row.querySelector('.variant-es-producible')?.checked;
    
    // Purchase units
    const purchaseUnits = [];
    const purchaseUnitRows = row.querySelectorAll('.variant-purchase-units-list > .flex');
    purchaseUnitRows.forEach(puRow => {
      const supplierId = puRow.querySelector('.variant-purchase-unit-supplier')?.value.trim();
      const unidad = puRow.querySelector('.variant-purchase-unit-unidad')?.value.trim();
      if (supplierId && unidad) {
        purchaseUnits.push({ supplierId, unidad });
      }
    });
    
    // Conversions
    const conversions = [];
    const conversionRows = row.querySelectorAll('.variant-conversions-list > .flex');
    conversionRows.forEach(convRow => {
      const fromUnit = convRow.querySelector('.variant-conversion-from')?.value.trim();
      const toUnit = convRow.querySelector('.variant-conversion-to')?.value.trim();
      const factorValue = convRow.querySelector('.variant-conversion-factor')?.value.trim();
      if (fromUnit && toUnit && factorValue) {
        const factor = parseFloat(factorValue);
        if (!isNaN(factor) && factor > 0) {
          conversions.push({ fromUnit, toUnit, factor });
        }
      }
    });
    
    if (!name) return; // Skip incomplete variants
    
    const price = parseFloat(priceValue);
    if (isNaN(price) || price < 0) return; // Skip invalid prices
    
    const variant = {
      name,
      price,
      active: active !== false
    };
    
    if (sku) {
      variant.sku = sku;
    }
    
    if (costValue) {
      const cost = parseFloat(costValue);
      if (!isNaN(cost) && cost >= 0) {
        variant.cost = cost;
      }
    }
    
    // Add units (only if defined, otherwise inherit from parent)
    if (unidadVenta) {
      variant.unidadVenta = unidadVenta;
    }
    if (unidadProduccion) {
      variant.unidadProduccion = unidadProduccion;
    }
    if (purchaseUnits.length > 0) {
      variant.unidadesCompra = purchaseUnits;
    }
    if (conversions.length > 0) {
      variant.conversiones = conversions;
    }
    
    // Add roles (only if checked, otherwise inherit from parent)
    if (esVendible) variant.esVendible = true;
    if (esComprable) variant.esComprable = true;
    if (esInsumo) variant.esInsumo = true;
    if (esProducible) variant.esProducible = true;
    
    variants.push(variant);
  });
  
  return variants;
}

function validateVariants(variants, parentSku) {
  if (variants.length === 0) return null;
  
  // Check unique names
  const names = variants.map(v => v.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    return 'Las variantes deben tener nombres únicos';
  }
  
  // Check unique SKUs
  const skus = variants
    .filter(v => v.sku)
    .map(v => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length) {
    return 'Los SKUs de las variantes deben ser únicos';
  }
  
  return null;
}

// Units management
let suppliersCache = null;

// Load suppliers for purchase units selector
async function loadSuppliers() {
  if (suppliersCache) return suppliersCache;
  try {
    const suppliers = await nrd.suppliers.getAll();
    suppliersCache = Array.isArray(suppliers) ? suppliers : Object.values(suppliers || {});
    return suppliersCache;
  } catch (error) {
    logger.error('Failed to load suppliers', error);
    return [];
  }
}

// Get unit options HTML
function getUnitOptionsHTML(selectedUnit = '') {
  const units = [
    { value: 'kg', label: 'Kilogramo (kg)' },
    { value: 'g', label: 'Gramo (g)' },
    { value: 'litro', label: 'Litro (L)' },
    { value: 'ml', label: 'Mililitro (mL)' },
    { value: 'unidad', label: 'Unidad' },
    { value: 'caja', label: 'Caja' },
    { value: 'paquete', label: 'Paquete' },
    { value: 'bolsa', label: 'Bolsa' },
    { value: 'botella', label: 'Botella' },
    { value: 'lata', label: 'Lata' }
  ];
  
  return units.map(unit => 
    `<option value="${unit.value}" ${selectedUnit === unit.value ? 'selected' : ''}>${unit.label}</option>`
  ).join('');
}

// Add purchase unit row
async function addPurchaseUnitRow(purchaseUnit = null) {
  const purchaseUnitsList = document.getElementById('purchase-units-list');
  if (!purchaseUnitsList) return;
  
  const suppliers = await loadSuppliers();
  if (suppliers.length === 0) {
    await showError('No hay proveedores registrados. Debe crear proveedores primero.');
    return;
  }
  
  const rowId = purchaseUnit ? purchaseUnit.supplierId : Date.now().toString();
  const row = document.createElement('div');
  row.className = 'border border-gray-200 rounded p-2 sm:p-3 bg-gray-50';
  row.dataset.purchaseUnitId = rowId;
  
  const supplierOptions = suppliers.map(supplier => 
    `<option value="${supplier.id}" ${purchaseUnit && purchaseUnit.supplierId === supplier.id ? 'selected' : ''}>${escapeHtml(supplier.name)}</option>`
  ).join('');
  
  row.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
      <div class="sm:col-span-5">
        <label class="block text-xs text-gray-600 mb-1">Proveedor</label>
        <select class="purchase-unit-supplier w-full px-2 py-1.5 border border-gray-300 rounded text-sm" required>
          <option value="">Seleccione...</option>
          ${supplierOptions}
        </select>
      </div>
      <div class="sm:col-span-5">
        <label class="block text-xs text-gray-600 mb-1">Unidad</label>
        <select class="purchase-unit-unidad w-full px-2 py-1.5 border border-gray-300 rounded text-sm" required>
          <option value="">Seleccione...</option>
          ${getUnitOptionsHTML(purchaseUnit ? purchaseUnit.unidad : '')}
        </select>
      </div>
      <div class="sm:col-span-2">
        <button type="button" class="remove-purchase-unit-btn w-full px-2 py-1.5 text-red-600 hover:bg-red-50 border border-red-600 rounded text-sm transition-colors">
          ×
        </button>
      </div>
    </div>
  `;
  
  const removeBtn = row.querySelector('.remove-purchase-unit-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      row.remove();
      // Regenerate conversions when a purchase unit is removed
      setTimeout(() => updateConversionsFromUnits(), 10);
    });
  }
  
  // When purchase unit changes, regenerate conversions
  const unidadSelect = row.querySelector('.purchase-unit-unidad');
  if (unidadSelect) {
    unidadSelect.addEventListener('change', () => {
      setTimeout(() => updateConversionsFromUnits(), 10);
    });
  }
  
  purchaseUnitsList.appendChild(row);
  
  // Regenerate conversions after adding the row
  setTimeout(() => updateConversionsFromUnits(), 10);
}

// Collect purchase units
function collectPurchaseUnits() {
  const purchaseUnitsList = document.getElementById('purchase-units-list');
  if (!purchaseUnitsList) return [];
  
  const purchaseUnits = [];
  const rows = purchaseUnitsList.querySelectorAll('[data-purchase-unit-id]');
  const supplierIds = new Set();
  
  rows.forEach(row => {
    const supplierId = row.querySelector('.purchase-unit-supplier')?.value.trim();
    const unidad = row.querySelector('.purchase-unit-unidad')?.value.trim();
    
    if (!supplierId || !unidad) return; // Skip incomplete rows
    
    if (supplierIds.has(supplierId)) {
      // Duplicate supplier - skip or show error
      return;
    }
    
    supplierIds.add(supplierId);
    purchaseUnits.push({ supplierId, unidad });
  });
  
  return purchaseUnits;
}

// Add conversion row (internal version without triggering update)
function addConversionRowWithoutUpdate(conversion = null) {
  const conversionsList = document.getElementById('conversions-list');
  if (!conversionsList) return;
  
  const rowId = conversion ? `${conversion.fromUnit}_${conversion.toUnit}` : Date.now().toString();
  const row = document.createElement('div');
  row.className = 'border border-gray-200 rounded p-2 sm:p-3 bg-gray-50';
  row.dataset.conversionId = rowId;
  
  row.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
      <div class="sm:col-span-3">
        <label class="block text-xs text-gray-600 mb-1">De</label>
        <select class="conversion-from w-full px-2 py-1.5 border border-gray-300 rounded text-sm" required>
          <option value="">Seleccione...</option>
          ${getUnitOptionsHTML(conversion ? conversion.fromUnit : '')}
        </select>
      </div>
      <div class="sm:col-span-3">
        <label class="block text-xs text-gray-600 mb-1">A</label>
        <select class="conversion-to w-full px-2 py-1.5 border border-gray-300 rounded text-sm" required>
          <option value="">Seleccione...</option>
          ${getUnitOptionsHTML(conversion ? conversion.toUnit : '')}
        </select>
      </div>
      <div class="sm:col-span-4">
        <label class="block text-xs text-gray-600 mb-1">Factor de Conversión</label>
        <input type="number" class="conversion-factor w-full px-2 py-1.5 border border-gray-300 rounded text-sm" 
          step="0.0001" min="0.0001" 
          value="${conversion && conversion.factor ? parseFloat(conversion.factor || 1).toFixed(4) : ''}" 
          placeholder="Ej: 1000 (1 kg = 1000 g)" required>
        <div class="text-xs text-gray-500 mt-1 conversion-preview"></div>
      </div>
      <div class="sm:col-span-2">
        <button type="button" class="remove-conversion-btn w-full px-2 py-1.5 text-red-600 hover:bg-red-50 border border-red-600 rounded text-sm transition-colors">
          ×
        </button>
      </div>
    </div>
  `;
  
  // Update preview when values change
  const updatePreview = () => {
    const fromUnit = row.querySelector('.conversion-from')?.value;
    const toUnit = row.querySelector('.conversion-to')?.value;
    const factor = row.querySelector('.conversion-factor')?.value;
    const preview = row.querySelector('.conversion-preview');
    
    if (preview && fromUnit && toUnit && factor) {
      preview.textContent = `1 ${fromUnit} = ${parseFloat(factor).toFixed(4)} ${toUnit}`;
      preview.classList.remove('hidden');
    } else {
      preview.textContent = '';
      preview.classList.add('hidden');
    }
  };
  
  // When units change, regenerate conversions
  const fromSelect = row.querySelector('.conversion-from');
  const toSelect = row.querySelector('.conversion-to');
  
  if (fromSelect) {
    fromSelect.addEventListener('change', () => {
      updatePreview();
      // Regenerate all conversions when a unit changes
      updateConversionsFromUnits();
    });
  }
  
  if (toSelect) {
    toSelect.addEventListener('change', () => {
      updatePreview();
      // Regenerate all conversions when a unit changes
      updateConversionsFromUnits();
    });
  }
  
  row.querySelector('.conversion-factor')?.addEventListener('input', updatePreview);
  updatePreview();
  
  const removeBtn = row.querySelector('.remove-conversion-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      row.remove();
      // Regenerate conversions after removing one
      updateConversionsFromUnits();
    });
  }
  
  conversionsList.appendChild(row);
}

// Add conversion row (public API - delegates to internal version)
function addConversionRow(conversion = null) {
  addConversionRowWithoutUpdate(conversion);
}

// Collect conversions
function collectConversions() {
  const conversionsList = document.getElementById('conversions-list');
  if (!conversionsList) return [];
  
  const conversions = [];
  const rows = conversionsList.querySelectorAll('[data-conversion-id]');
  const conversionKeys = new Set();
  
  rows.forEach(row => {
    const fromUnit = row.querySelector('.conversion-from')?.value.trim();
    const toUnit = row.querySelector('.conversion-to')?.value.trim();
    const factorValue = row.querySelector('.conversion-factor')?.value.trim();
    
    if (!fromUnit || !toUnit || !factorValue) return; // Skip incomplete rows
    
    const factor = parseFloat(factorValue);
    if (isNaN(factor) || factor <= 0) return; // Skip invalid factors
    
    const key = `${fromUnit}_${toUnit}`;
    if (conversionKeys.has(key)) {
      // Duplicate conversion - skip
      return;
    }
    
    if (fromUnit === toUnit) {
      // Same unit conversion - skip
      return;
    }
    
    conversionKeys.add(key);
    conversions.push({ fromUnit, toUnit, factor });
  });
  
  return conversions;
}

// Get all unique units from the product form
function getAllUniqueUnits() {
  const units = new Set();
  
  // Add unidadVenta
  const unidadVenta = document.getElementById('product-unidad-venta')?.value.trim();
  if (unidadVenta) units.add(unidadVenta);
  
  // Add unidadProduccion
  const unidadProduccion = document.getElementById('product-unidad-produccion')?.value.trim();
  if (unidadProduccion) units.add(unidadProduccion);
  
  // Add unidadesCompra
  const purchaseUnitsList = document.getElementById('purchase-units-list');
  if (purchaseUnitsList) {
    const purchaseUnitRows = purchaseUnitsList.querySelectorAll('[data-purchase-unit-id]');
    purchaseUnitRows.forEach(row => {
      const unidad = row.querySelector('.purchase-unit-unidad')?.value.trim();
      if (unidad) units.add(unidad);
    });
  }
  
  return Array.from(units);
}

// Generate required conversions between all units
function generateRequiredConversions() {
  const units = getAllUniqueUnits();
  
  // Need at least 2 units to have conversions
  if (units.length < 2) {
    return [];
  }
  
  // Generate all possible pairs (A->B for all A != B)
  const requiredConversions = [];
  for (let i = 0; i < units.length; i++) {
    for (let j = 0; j < units.length; j++) {
      if (i !== j) {
        requiredConversions.push({
          fromUnit: units[i],
          toUnit: units[j]
        });
      }
    }
  }
  
  return requiredConversions;
}

// Flag to prevent infinite loops during conversion updates
let isUpdatingConversions = false;

// Update conversions list based on current units
function updateConversionsFromUnits() {
  // Prevent infinite loops
  if (isUpdatingConversions) return;
  
  const conversionsList = document.getElementById('conversions-list');
  if (!conversionsList) return;
  
  isUpdatingConversions = true;
  
  try {
    const units = getAllUniqueUnits();
    
    // If less than 2 units, clear conversions
    if (units.length < 2) {
      conversionsList.innerHTML = '';
      return;
    }
    
    // Get existing conversions
    const existingRows = conversionsList.querySelectorAll('[data-conversion-id]');
    const existingConversions = new Map();
    
    existingRows.forEach(row => {
      const fromUnit = row.querySelector('.conversion-from')?.value.trim();
      const toUnit = row.querySelector('.conversion-to')?.value.trim();
      const factor = row.querySelector('.conversion-factor')?.value.trim();
      
      if (fromUnit && toUnit && factor) {
        const key = `${fromUnit}_${toUnit}`;
        existingConversions.set(key, {
          fromUnit,
          toUnit,
          factor: parseFloat(factor)
        });
      }
    });
    
    // Generate required conversions
    const requiredConversions = generateRequiredConversions();
    
    // Check if we need to update (compare required vs existing)
    const existingKeys = new Set();
    existingRows.forEach(row => {
      const fromUnit = row.querySelector('.conversion-from')?.value.trim();
      const toUnit = row.querySelector('.conversion-to')?.value.trim();
      if (fromUnit && toUnit) {
        existingKeys.add(`${fromUnit}_${toUnit}`);
      }
    });
    
    const requiredKeys = new Set(requiredConversions.map(r => `${r.fromUnit}_${r.toUnit}`));
    
    // Only update if there are differences
    const needsUpdate = requiredKeys.size !== existingKeys.size || 
      !Array.from(requiredKeys).every(key => existingKeys.has(key));
    
    if (!needsUpdate) {
      return; // No update needed
    }
    
    // Clear current conversions
    conversionsList.innerHTML = '';
    
    // Add conversions (use existing factor if available, otherwise empty)
    requiredConversions.forEach(required => {
      const key = `${required.fromUnit}_${required.toUnit}`;
      const existing = existingConversions.get(key);
      
      if (existing) {
        // Keep existing conversion with its factor
        addConversionRowWithoutUpdate({
          fromUnit: existing.fromUnit,
          toUnit: existing.toUnit,
          factor: existing.factor
        });
      } else {
        // Add new conversion row (empty factor, user must fill)
        addConversionRowWithoutUpdate({
          fromUnit: required.fromUnit,
          toUnit: required.toUnit,
          factor: null
        });
      }
    });
  } finally {
    isUpdatingConversions = false;
  }
}

// Validate conversions
function validateConversions(conversions) {
  if (conversions.length === 0) {
    // Check if there are units but no conversions
    const units = getAllUniqueUnits();
    if (units.length >= 2) {
      return 'Debe definir conversiones entre todas las unidades. Hay ' + units.length + ' unidades pero no hay conversiones definidas.';
    }
    return null;
  }
  
  // Check for duplicate conversions
  const keys = conversions.map(c => `${c.fromUnit}_${c.toUnit}`);
  if (new Set(keys).size !== keys.length) {
    return 'No puede haber conversiones duplicadas entre las mismas unidades';
  }
  
  // Check that all required conversions are present
  const units = getAllUniqueUnits();
  if (units.length >= 2) {
    const requiredConversions = generateRequiredConversions();
    const conversionKeys = new Set(keys);
    
    for (const required of requiredConversions) {
      const key = `${required.fromUnit}_${required.toUnit}`;
      if (!conversionKeys.has(key)) {
        return `Falta la conversión de ${required.fromUnit} a ${required.toUnit}`;
      }
    }
  }
  
  // Check for circular conversions (A->B and B->A with incompatible factors)
  for (let i = 0; i < conversions.length; i++) {
    for (let j = i + 1; j < conversions.length; j++) {
      const c1 = conversions[i];
      const c2 = conversions[j];
      
      if (c1.fromUnit === c2.toUnit && c1.toUnit === c2.fromUnit) {
        // Check if factors are consistent (c1.factor * c2.factor should be close to 1)
        const product = c1.factor * c2.factor;
        if (Math.abs(product - 1) > 0.01) {
          return `Las conversiones entre ${c1.fromUnit} y ${c1.toUnit} no son consistentes`;
        }
      }
    }
  }
  
  return null;
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

// Product form submit handler
let productFormHandlerSetup = false;
function setupProductFormHandler() {
  if (productFormHandlerSetup) return;
  const formElement = document.getElementById('product-form-element');
  if (!formElement) return;
  
  productFormHandlerSetup = true;
  
  // Add variant button handler
  const addVariantBtn = document.getElementById('add-variant-btn');
  if (addVariantBtn) {
    addVariantBtn.addEventListener('click', async () => {
      await addVariantRow();
    });
  }
  
  // Add purchase unit button handler
  const addPurchaseUnitBtn = document.getElementById('add-purchase-unit-btn');
  if (addPurchaseUnitBtn) {
    addPurchaseUnitBtn.addEventListener('click', async () => {
      await addPurchaseUnitRow();
    });
  }
  
  // Add conversion button handler (disabled - conversions are auto-generated)
  const addConversionBtn = document.getElementById('add-conversion-btn');
  if (addConversionBtn) {
    addConversionBtn.style.display = 'none'; // Hide button - conversions are auto-generated
  }
  
  // Listen for changes in unidadVenta and unidadProduccion
  const unidadVentaSelect = document.getElementById('product-unidad-venta');
  const unidadProduccionSelect = document.getElementById('product-unidad-produccion');
  
  if (unidadVentaSelect) {
    unidadVentaSelect.addEventListener('change', () => {
      updateConversionsFromUnits();
    });
  }
  
  if (unidadProduccionSelect) {
    unidadProduccionSelect.addEventListener('change', () => {
      updateConversionsFromUnits();
    });
  }
  
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const productId = document.getElementById('product-id').value;
    const name = document.getElementById('product-name').value.trim();
    const sku = document.getElementById('product-sku').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const costValue = document.getElementById('product-cost').value.trim();
    const cost = costValue ? parseFloat(costValue) : undefined;
    const active = document.getElementById('product-active').checked;
    
    // Get roles
    const esVendible = document.getElementById('product-es-vendible').checked;
    const esComprable = document.getElementById('product-es-comprable').checked;
    const esInsumo = document.getElementById('product-es-insumo').checked;
    const esProducible = document.getElementById('product-es-producible').checked;

    if (!name || isNaN(price) || price < 0) {
      await showError('Por favor complete todos los campos requeridos correctamente (nombre y precio > 0)');
      return;
    }

    if (cost !== undefined && (isNaN(cost) || cost < 0)) {
      await showError('El costo debe ser un número válido mayor o igual a 0');
      return;
    }

    // Collect and validate variants
    const variants = collectVariants();
    const variantError = validateVariants(variants, sku);
    if (variantError) {
      await showError(variantError);
      return;
    }
    
    // Collect units
    const unidadVenta = document.getElementById('product-unidad-venta').value.trim();
    const unidadProduccion = document.getElementById('product-unidad-produccion').value.trim();
    const purchaseUnits = collectPurchaseUnits();
    const conversions = collectConversions();
    
    // Validate conversions
    const conversionError = validateConversions(conversions);
    if (conversionError) {
      await showError(conversionError);
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
      if (variants.length > 0) {
        productData.variants = variants;
      }
      // Add roles (always include them, set to true or false)
      productData.esVendible = esVendible;
      productData.esComprable = esComprable;
      productData.esInsumo = esInsumo;
      productData.esProducible = esProducible;
      
      // Add units
      if (unidadVenta) {
        productData.unidadVenta = unidadVenta;
      }
      if (unidadProduccion) {
        productData.unidadProduccion = unidadProduccion;
      }
      if (purchaseUnits.length > 0) {
        productData.unidadesCompra = purchaseUnits;
      }
      if (conversions.length > 0) {
        productData.conversiones = conversions;
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
  // Setup product form handler (includes variant button and submit)
  setupProductFormHandler();
  
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

