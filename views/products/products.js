// Product management (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;
const escapeHtml = window.escapeHtml || ((text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
});

// Calculate direct cost of a recipe batch using current real-time prices
async function calculateRecipeDirectCost(recipe, productsData, laborRolesData) {
  let cost = 0;
  
  // Sum of inputs (products with esInsumo: true) - quantity × current cost
  if (recipe.inputs && recipe.inputs.length > 0) {
    for (const recipeInput of recipe.inputs) {
      const productId = recipeInput.productId || recipeInput.inputId;
      const product = productsData[productId];
      
      if (product && product.cost !== undefined) {
        cost += recipeInput.quantity * product.cost;
      }
    }
  }
  
  // Sum of labor (hours × current hourly cost)
  if (recipe.labor && recipe.labor.length > 0) {
    for (const recipeLabor of recipe.labor) {
      const laborRole = laborRolesData[recipeLabor.roleId];
      if (laborRole && laborRole.hourlyCost) {
        cost += recipeLabor.hours * laborRole.hourlyCost;
      }
    }
  }
  
  return cost;
}

// Calculate direct unit cost from recipe
function calculateRecipeUnitCost(directCost, batchYield) {
  if (!batchYield || batchYield <= 0) return 0;
  return directCost / batchYield;
}

// Calculate product cost from recipe
async function calculateProductCostFromRecipe(product) {
  if (!product || !product.esProducible || !product.recipeId) {
    return null;
  }
  
  const nrd = window.nrd;
  if (!nrd || !nrd.recipes) {
    logger.warn('Recipes service not available');
    return null;
  }
  
  try {
    // Get recipe
    const recipe = await nrd.recipes.getById(product.recipeId);
    if (!recipe || recipe.active === false) {
      return null;
    }
    
    // Get all products for inputs
    const allProducts = await nrd.products.getAll();
    const productsData = {};
    if (Array.isArray(allProducts)) {
      allProducts.forEach(p => {
        if (p && p.id) productsData[p.id] = p;
      });
    }
    
    // Get labor roles (if available)
    let laborRolesData = {};
    if (nrd.laborRoles) {
      try {
        const allLaborRoles = await nrd.laborRoles.getAll();
        if (Array.isArray(allLaborRoles)) {
          allLaborRoles.forEach(lr => {
            if (lr && lr.id) laborRolesData[lr.id] = lr;
          });
        }
      } catch (e) {
        logger.warn('Could not load labor roles for cost calculation', e);
      }
    }
    
    // Calculate direct cost
    const directCost = await calculateRecipeDirectCost(recipe, productsData, laborRolesData);
    
    // Calculate unit cost
    const unitCost = calculateRecipeUnitCost(directCost, recipe.batchYield);
    
    return unitCost;
  } catch (error) {
    logger.error('Error calculating cost from recipe', error);
    return null;
  }
}

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

  // Get nrd instance dynamically (initialized in index.html)
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    return;
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
      productsList.innerHTML = `
        <div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8">
          <p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">No hay productos registrados</p>
        </div>
      `;
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
async function showProductForm(productId = null) {
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
  const variantsEmpty = document.getElementById('product-variants-empty');
  if (variantsEmpty) variantsEmpty.style.display = 'block';
  
  // Clear product units table
  const productUnitsList = document.getElementById('product-units-list');
  if (productUnitsList) productUnitsList.innerHTML = '';
  const productUnitsEmpty = document.getElementById('product-units-empty');
  if (productUnitsEmpty) productUnitsEmpty.style.display = 'block';
  
  // Preload measurement units for the table
  await loadMeasurementUnits();

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
      const nrd = window.nrd;
      if (!nrd) {
        await (window.showError || alert)('Servicio no disponible');
        return;
      }
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
        
        // Check if product is producible and has recipe - make cost read-only and calculate from recipe
        const costInput = document.getElementById('product-cost');
        const esProducible = product.esProducible === true;
        const hasRecipe = product.recipeId && product.recipeId.trim() !== '';
        
        if (esProducible && hasRecipe) {
          // Make cost read-only
          costInput.readOnly = true;
          costInput.classList.add('bg-gray-100', 'cursor-not-allowed');
          costInput.classList.remove('bg-transparent');
          
          // Calculate cost from recipe
          const calculatedCost = await calculateProductCostFromRecipe(product);
          if (calculatedCost !== null) {
            costInput.value = calculatedCost.toFixed(2);
          } else {
            costInput.value = product.cost || '';
          }
        } else {
          // Make cost editable
          costInput.readOnly = false;
          costInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
          costInput.classList.add('bg-transparent');
          costInput.value = product.cost || '';
        }
        
        // Load units into table
        await loadProductUnitsToTable(product);
        
        
        // Load variants (as simple rows)
        if (variantsList) {
          variantsList.innerHTML = '';
          if (product.variants && Array.isArray(product.variants)) {
            for (const variant of product.variants) {
              addVariantRow(variant);
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
    
    // Reset cost input for new product
    const costInput = document.getElementById('product-cost');
    if (costInput) {
      costInput.readOnly = false;
      costInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
      costInput.classList.add('bg-transparent');
      costInput.value = '';
    }
    
    // Clear product units table
    const productUnitsList = document.getElementById('product-units-list');
    if (productUnitsList) productUnitsList.innerHTML = '';
    const productUnitsEmpty = document.getElementById('product-units-empty');
    if (productUnitsEmpty) productUnitsEmpty.style.display = 'block';
  }
  
  // Add listener to es-producible checkbox to update cost field state
  const esProducibleCheckbox = document.getElementById('product-es-producible');
  if (esProducibleCheckbox) {
    const updateCostFieldState = async () => {
      const costInput = document.getElementById('product-cost');
      if (!costInput) return;
      
      const isProducible = esProducibleCheckbox.checked;
      const productId = document.getElementById('product-id').value;
      
      if (isProducible && productId) {
        // Check if product has recipe
        const nrd = window.nrd;
        if (nrd && nrd.products) {
          try {
            const product = await nrd.products.getById(productId);
            if (product && product.recipeId) {
              // Make cost read-only and calculate from recipe
              costInput.readOnly = true;
              costInput.classList.add('bg-gray-100', 'cursor-not-allowed');
              costInput.classList.remove('bg-transparent');
              
              const calculatedCost = await calculateProductCostFromRecipe(product);
              if (calculatedCost !== null) {
                costInput.value = calculatedCost.toFixed(2);
              }
            } else {
              // No recipe yet, keep editable
              costInput.readOnly = false;
              costInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
              costInput.classList.add('bg-transparent');
            }
          } catch (e) {
            logger.warn('Could not check recipe for product', e);
          }
        }
      } else {
        // Not producible, keep editable
        costInput.readOnly = false;
        costInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        costInput.classList.add('bg-transparent');
      }
    };
    
    // Remove old listener if exists and add new one
    const newCheckbox = esProducibleCheckbox.cloneNode(true);
    esProducibleCheckbox.parentNode.replaceChild(newCheckbox, esProducibleCheckbox);
    newCheckbox.addEventListener('change', updateCostFieldState);
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
  const nrd = window.nrd;
  if (!nrd) {
    await (window.showError || alert)('Servicio no disponible');
    return null;
  }
  
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

// Variants management - Show variant as simple row in list
function addVariantRow(variant = null) {
  const variantsList = document.getElementById('product-variants-list');
  const emptyMsg = document.getElementById('product-variants-empty');
  if (!variantsList) return;
  
  // Hide empty message
  if (emptyMsg) emptyMsg.style.display = 'none';
  
  const variantKey = variant ? (variant.sku || variant.name || Date.now().toString()) : Date.now().toString();
  const row = document.createElement('div');
  row.className = 'border border-gray-200 rounded p-3 bg-gray-50 mb-2';
  row.dataset.variantKey = variantKey;
  
  // Store variant data in dataset for editing and collection
  if (variant) {
    row.dataset.variantData = JSON.stringify(variant);
  }
  
  const variantName = variant ? escapeHtml(variant.name) : '';
  const variantSku = variant ? escapeHtml(variant.sku || '') : '';
  const variantPrice = variant ? parseFloat(variant.price || 0).toFixed(2) : '0.00';
  const variantCost = variant && variant.cost !== undefined ? parseFloat(variant.cost).toFixed(2) : '-';
  const isActive = variant ? (variant.active !== false) : true;
  
  row.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-medium text-sm text-gray-800">${variantName || 'Nueva Variante'}</span>
          ${isActive ? '<span class="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">Activa</span>' : '<span class="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Inactiva</span>'}
        </div>
        <div class="text-xs text-gray-600 space-x-3">
          ${variantSku ? `<span>SKU: <span class="font-mono">${variantSku}</span></span>` : ''}
          <span>Precio: <span class="text-red-600 font-medium">$${variantPrice}</span></span>
          ${variantCost !== '-' ? `<span>Costo: <span class="text-gray-700 font-medium">$${variantCost}</span></span>` : ''}
        </div>
      </div>
      <div class="flex gap-2">
        <button type="button" class="edit-variant-btn px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
          Editar
        </button>
        <button type="button" class="remove-variant-btn px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
          Eliminar
        </button>
      </div>
    </div>
  `;
  
  // Edit button handler
  const editBtn = row.querySelector('.edit-variant-btn');
  if (editBtn) {
    editBtn.addEventListener('click', async () => {
      let variantData = null;
      if (row.dataset.variantData) {
        try {
          variantData = JSON.parse(row.dataset.variantData);
        } catch (e) {
          logger.warn('Failed to parse variant data', e);
        }
      }
      // Remove row temporarily (will be re-added after edit)
      row.remove();
      updateVariantsEmptyState();
      // Show modal with variant data
      await showEditVariantModal(variantData, variantKey);
    });
  }
  
  // Remove button handler
  const removeBtn = row.querySelector('.remove-variant-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      row.remove();
      updateVariantsEmptyState();
    });
  }
  
  variantsList.appendChild(row);
}

// Update empty state for variants list
function updateVariantsEmptyState() {
  const variantsList = document.getElementById('product-variants-list');
  const emptyMsg = document.getElementById('product-variants-empty');
  
  if (!variantsList || !emptyMsg) return;
  
  if (variantsList.children.length === 0) {
    emptyMsg.style.display = 'block';
  } else {
    emptyMsg.style.display = 'none';
  }
}

// Old variant purchase unit and conversion functions removed - now using table-based system like products

function collectVariants() {
  const variantsList = document.getElementById('product-variants-list');
  if (!variantsList) return [];
  
  const variants = [];
  const rows = variantsList.querySelectorAll('[data-variant-key]');
  
  rows.forEach(row => {
    // Get variant data from dataset (stored when added via modal)
    if (!row.dataset.variantData) return;
    
    try {
      const variant = JSON.parse(row.dataset.variantData);
      variants.push(variant);
    } catch (e) {
      logger.warn('Failed to parse variant data', e);
    }
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

// Get unit options HTML from measurement units database (no custom units)
async function getUnitOptionsHTMLForProduct(selectedUnit = '') {
  const units = await loadMeasurementUnits();
  
  // If no units found, return empty or selected unit if exists
  if (units.length === 0) {
    return selectedUnit ? `<option value="${escapeHtml(selectedUnit)}" selected>${escapeHtml(selectedUnit)}</option>` : '';
  }
  
  return units.map(unit => 
    `<option value="${escapeHtml(unit.name)}" ${selectedUnit === unit.name ? 'selected' : ''}>${escapeHtml(unit.name)}</option>`
  ).join('');
}

// Show modal to edit product unit
async function showEditProductUnitModal(unitData = null, unitKey = null) {
  const modal = document.getElementById('custom-modal');
  const modalContent = document.getElementById('modal-content');
  const titleEl = document.getElementById('modal-title');
  const messageEl = document.getElementById('modal-message');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  
  if (!modal || !modalContent || !titleEl || !messageEl) return;
  
  // Make modal wider for units
  modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
  modalContent.classList.add('max-w-3xl');
  
  // Load suppliers
  const suppliers = await loadSuppliers();
  const supplierOptions = suppliers.map(s => 
    `<option value="${s.id}">${escapeHtml(s.name)}</option>`
  ).join('');
  
  const isEditing = unitData !== null;
  const selectedType = unitData ? unitData.type : '';
  const selectedUnit = unitData ? (unitData.unitName || '') : '';
  const selectedSupplier = unitData && unitData.supplierId ? unitData.supplierId : '';
  
  // Load units from database
  const unitOptionsHTML = await getUnitOptionsHTMLForProduct(selectedUnit);
  
  // Create form HTML
  const formHTML = `
    <form id="add-product-unit-form" class="space-y-4">
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Tipo *</label>
        <select id="modal-unit-type" required
          class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600">
          <option value="">Seleccione...</option>
          <option value="venta" ${selectedType === 'venta' ? 'selected' : ''}>Venta</option>
          <option value="produccion" ${selectedType === 'produccion' ? 'selected' : ''}>Producción</option>
          <option value="compra" ${selectedType === 'compra' ? 'selected' : ''}>Compra</option>
        </select>
      </div>
      <div id="modal-supplier-container" class="${selectedType === 'compra' ? '' : 'hidden'}">
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Proveedor *</label>
        <select id="modal-unit-supplier"
          class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600">
          <option value="">Seleccione proveedor...</option>
          ${supplierOptions}
        </select>
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Unidad *</label>
        <select id="modal-unit-name" required
          class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600">
          <option value="">Seleccione...</option>
          ${unitOptionsHTML}
        </select>
        <p class="text-xs text-gray-500 mt-1">Las unidades deben crearse previamente en la gestión de medidas.</p>
      </div>
    </form>
  `;
  
  titleEl.textContent = isEditing ? 'Editar Unidad de Medida' : 'Agregar Unidad de Medida';
  messageEl.innerHTML = formHTML;
  
  // Set supplier value if editing
  if (selectedSupplier) {
    const supplierSelect = document.getElementById('modal-unit-supplier');
    if (supplierSelect) {
      supplierSelect.value = selectedSupplier;
    }
  }
  
  // Show modal
  modal.classList.remove('hidden');
  
  // Handle type change
  const typeSelect = document.getElementById('modal-unit-type');
  const supplierContainer = document.getElementById('modal-supplier-container');
  const supplierSelect = document.getElementById('modal-unit-supplier');
  
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      const type = e.target.value;
      if (type === 'compra') {
        supplierContainer.classList.remove('hidden');
        if (supplierSelect) supplierSelect.required = true;
      } else {
        supplierContainer.classList.add('hidden');
        if (supplierSelect) {
          supplierSelect.required = false;
          supplierSelect.value = '';
        }
      }
    });
  }
  
  // Focus on type select
  setTimeout(() => {
    if (typeSelect) typeSelect.focus();
  }, 100);
  
  // Confirm handler
  const handleConfirm = async () => {
    const type = typeSelect ? typeSelect.value.trim() : '';
    const unitNameSelect = document.getElementById('modal-unit-name');
    const unitName = unitNameSelect ? unitNameSelect.value.trim() : '';
    const supplierId = supplierSelect ? supplierSelect.value.trim() : '';
    
    if (!type) {
      const showErrorFn = window.showError || alert;
      showErrorFn('Debe seleccionar un tipo');
      return;
    }
    
    if (!unitName) {
      const showErrorFn = window.showError || alert;
      showErrorFn('Debe seleccionar una unidad');
      return;
    }
    
    if (type === 'compra' && !supplierId) {
      const showErrorFn = window.showError || alert;
      showErrorFn('Debe seleccionar un proveedor para unidades de compra');
      return;
    }
    
    // Create unit object (units must exist in measurement units - no custom units)
    const newUnitData = {
      type,
      unitName: unitName
    };
    
    if (type === 'compra') {
      newUnitData.supplierId = supplierId;
    }
    
    // Check if we're adding to a variant or product
    const variantRow = window.currentVariantRowForUnits;
    if (variantRow) {
      // Add to variant table (modal or regular)
      await addVariantUnitRow(variantRow, newUnitData);
      // Don't clear variant context - it's needed for modal
      // Don't restore modal width - keep it wide for variant modal
      // Don't close modal - it's nested inside variant modal
    } else {
      // Add to product table
      await addProductUnitRow(newUnitData);
      // Restore default modal width for product unit modal
      if (modalContent) {
        modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
        modalContent.classList.add('max-w-md');
      }
      // Close modal
      modal.classList.add('hidden');
    }
  };
  
  // Cancel handler
  const handleCancel = () => {
    // Restore default modal width
    if (modalContent) {
      modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
      modalContent.classList.add('max-w-md');
    }
    modal.classList.add('hidden');
  };
  
  // Remove old listeners and add new ones
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  newConfirmBtn.addEventListener('click', handleConfirm);
  
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  newCancelBtn.addEventListener('click', handleCancel);
  
  // Handle form submit
  const form = document.getElementById('add-product-unit-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleConfirm();
    });
  }
}

// Show modal to add product unit
async function showAddProductUnitModal() {
  await showEditProductUnitModal();
}

// Show modal to add/edit variant
async function showEditVariantModal(variantData = null, variantKey = null) {
  const modal = document.getElementById('custom-modal');
  const modalContent = document.getElementById('modal-content');
  const titleEl = document.getElementById('modal-title');
  const messageEl = document.getElementById('modal-message');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  
  if (!modal || !modalContent || !titleEl || !messageEl) return;
  
  // Make modal wider for variants
  modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
  modalContent.classList.add('max-w-3xl');
  
  const isEditing = variantData !== null;
  const variantName = variantData ? escapeHtml(variantData.name || '') : '';
  const variantSku = variantData ? escapeHtml(variantData.sku || '') : '';
  const variantPrice = variantData ? parseFloat(variantData.price || 0).toFixed(2) : '';
  const variantCost = variantData && variantData.cost !== undefined ? parseFloat(variantData.cost).toFixed(2) : '';
  const isActive = variantData ? (variantData.active !== false) : true;
  const esVendible = variantData ? (variantData.esVendible === true) : false;
  const esComprable = variantData ? (variantData.esComprable === true) : false;
  const esInsumo = variantData ? (variantData.esInsumo === true) : false;
  const esProducible = variantData ? (variantData.esProducible === true) : false;
  
  // Create a temporary container for variant units table (will be managed in modal)
  const tempVariantKey = variantKey || Date.now().toString();
  const variantUnitsContainerId = `variant-units-modal-${tempVariantKey}`;
  
  const formHTML = `
    <form id="add-variant-form" class="space-y-4 max-h-[80vh] overflow-y-auto">
      <!-- Basic Info -->
      <div class="space-y-3">
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Nombre *</label>
          <input type="text" id="modal-variant-name" value="${variantName}"
            class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600"
            placeholder="Ej: Pequeña, Grande, Chocolate" required>
        </div>
        <div>
          <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">SKU</label>
          <input type="text" id="modal-variant-sku" value="${variantSku}"
            class="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-red-600"
            placeholder="SKU completo de la variante">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Precio *</label>
            <input type="number" id="modal-variant-price" step="0.01" min="0" value="${variantPrice}"
              class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600" required>
          </div>
          <div>
            <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Costo</label>
            <input type="number" id="modal-variant-cost" step="0.01" min="0" value="${variantCost}"
              class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600">
          </div>
        </div>
        <div>
          <label class="flex items-center">
            <input type="checkbox" id="modal-variant-active" ${isActive ? 'checked' : ''} class="mr-2">
            <span class="text-xs text-gray-600">Activa</span>
          </label>
        </div>
      </div>
      
      <!-- Units Table (same as products) -->
      <div class="pt-4 border-t border-gray-200">
        <div class="flex items-center justify-between mb-3">
          <label class="text-xs uppercase tracking-wider text-gray-600">Unidades de Medida</label>
          <button type="button" class="add-variant-modal-unit-btn px-3 py-1.5 text-xs bg-gray-200 text-gray-700 border border-gray-300 rounded hover:bg-gray-300 transition-colors uppercase tracking-wider font-light">
            + Agregar Unidad
          </button>
        </div>
        <p class="text-xs text-gray-500 mb-3">Defina las unidades de medida para venta, producción y compra de la variante.</p>
        <div class="overflow-x-auto">
          <table class="w-full border border-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-600 border-b border-gray-200">Tipo</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-600 border-b border-gray-200">Unidad</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-600 border-b border-gray-200">Conversiones</th>
                <th class="px-3 py-2 text-center text-xs font-medium text-gray-600 border-b border-gray-200 w-32">Acciones</th>
              </tr>
            </thead>
            <tbody id="${variantUnitsContainerId}" class="variant-units-list">
              <!-- Las unidades de medida se mostrarán aquí -->
            </tbody>
          </table>
          <div id="${variantUnitsContainerId}-empty" class="variant-units-empty text-center py-4 text-gray-500 text-sm border border-gray-200 border-t-0">
            No hay unidades de medida agregadas
          </div>
        </div>
      </div>
      
      <!-- Roles -->
      <div class="pt-4 border-t border-gray-200">
        <label class="block mb-2 text-xs uppercase tracking-wider text-gray-600">Roles</label>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center">
            <input type="checkbox" id="modal-variant-es-vendible" ${esVendible ? 'checked' : ''} class="mr-2">
            <span class="text-xs text-gray-600">Vendible</span>
          </label>
          <label class="flex items-center">
            <input type="checkbox" id="modal-variant-es-comprable" ${esComprable ? 'checked' : ''} class="mr-2">
            <span class="text-xs text-gray-600">Comprable</span>
          </label>
          <label class="flex items-center">
            <input type="checkbox" id="modal-variant-es-insumo" ${esInsumo ? 'checked' : ''} class="mr-2">
            <span class="text-xs text-gray-600">Insumo</span>
          </label>
          <label class="flex items-center">
            <input type="checkbox" id="modal-variant-es-producible" ${esProducible ? 'checked' : ''} class="mr-2">
            <span class="text-xs text-gray-600">Producible</span>
          </label>
        </div>
      </div>
    </form>
  `;
  
  titleEl.textContent = isEditing ? 'Editar Variante' : 'Agregar Variante';
  messageEl.innerHTML = formHTML;
  
  // Show modal first so we can access the table elements
  modal.classList.remove('hidden');
  
  // Store reference to the actual table elements in modal for units
  // Create a proxy object that queries the modal elements directly
  window.currentVariantRowForUnits = {
    id: `temp-variant-row-${tempVariantKey}`,
    querySelector: (selector) => {
      // For modal, query from the actual modal elements
      if (selector === '.variant-units-list') {
        return document.getElementById(variantUnitsContainerId);
      }
      if (selector === '.variant-units-empty') {
        return document.getElementById(`${variantUnitsContainerId}-empty`);
      }
      return null;
    }
  };
  window.currentVariantKey = tempVariantKey;
  
  // Load variant units if editing (after modal is shown)
  if (variantData) {
    await loadVariantUnitsToTable(variantData, window.currentVariantRowForUnits);
  }
  
  // Add variant unit button handler (use querySelector since it's a class, not an ID)
  // Use setTimeout to ensure DOM is ready after innerHTML
  setTimeout(() => {
    const addVariantUnitBtn = messageEl.querySelector('.add-variant-modal-unit-btn');
    if (addVariantUnitBtn) {
      addVariantUnitBtn.addEventListener('click', async () => {
        await showEditProductUnitModal();
      });
    } else {
      logger.warn('Add variant unit button not found in modal');
    }
  }, 0);
  
  // Focus on name input
  setTimeout(() => {
    const nameInput = document.getElementById('modal-variant-name');
    if (nameInput) nameInput.focus();
  }, 100);
  
  // Confirm handler
  const handleConfirm = async () => {
    const name = document.getElementById('modal-variant-name')?.value.trim();
    const sku = document.getElementById('modal-variant-sku')?.value.trim();
    const priceValue = document.getElementById('modal-variant-price')?.value.trim();
    const costValue = document.getElementById('modal-variant-cost')?.value.trim();
    const active = document.getElementById('modal-variant-active')?.checked;
    const esVendible = document.getElementById('modal-variant-es-vendible')?.checked;
    const esComprable = document.getElementById('modal-variant-es-comprable')?.checked;
    const esInsumo = document.getElementById('modal-variant-es-insumo')?.checked;
    const esProducible = document.getElementById('modal-variant-es-producible')?.checked;
    
    if (!name) {
      await showError('El nombre es requerido');
      return;
    }
    
    const price = parseFloat(priceValue);
    if (isNaN(price) || price < 0) {
      await showError('El precio debe ser un número válido');
      return;
    }
    
    // Collect units from modal variant row
    const variantUnits = collectVariantUnits(window.currentVariantRowForUnits);
    let unidadVenta = null;
    let unidadProduccion = null;
    const purchaseUnits = [];
    let conversionesArray = [];
    
    // Calculate conversions
    const conversions = await calculateVariantUnitConversions(window.currentVariantRowForUnits);
    
    variantUnits.forEach(unit => {
      if (unit.type === 'venta') {
        unidadVenta = unit.unitName;
      } else if (unit.type === 'produccion') {
        unidadProduccion = unit.unitName;
      } else if (unit.type === 'compra' && unit.supplierId) {
        const compraData = {
          supplierId: unit.supplierId,
          unidad: unit.unitName
        };
        purchaseUnits.push(compraData);
      }
    });
    
    // Convert conversions to array
    Object.keys(conversions).forEach(fromUnit => {
      conversions[fromUnit].forEach(conv => {
        conversionesArray.push({
          fromUnit: fromUnit,
          toUnit: conv.toUnit,
          factor: conv.factor
        });
      });
    });
    
    // Build variant object
    const newVariant = {
      name,
      price,
      active: active !== false
    };
    
    if (sku) {
      newVariant.sku = sku;
    }
    
    if (costValue) {
      const cost = parseFloat(costValue);
      if (!isNaN(cost) && cost >= 0) {
        newVariant.cost = cost;
      }
    }
    
    // Add units
    if (unidadVenta) {
      newVariant.unidadVenta = unidadVenta;
    }
    if (unidadProduccion) {
      newVariant.unidadProduccion = unidadProduccion;
    }
    if (purchaseUnits.length > 0) {
      newVariant.unidadesCompra = purchaseUnits;
    }
    if (conversionesArray.length > 0) {
      newVariant.conversiones = conversionesArray;
    }
    
    // Add roles
    if (esVendible) newVariant.esVendible = true;
    if (esComprable) newVariant.esComprable = true;
    if (esInsumo) newVariant.esInsumo = true;
    if (esProducible) newVariant.esProducible = true;
    
    // Add variant to list
    addVariantRow(newVariant);
    updateVariantsEmptyState();
    
    // Cleanup
    window.currentVariantRowForUnits = null;
    window.currentVariantKey = null;
    
    // Restore default modal width and close modal
    if (modalContent) {
      modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
      modalContent.classList.add('max-w-md');
    }
    modal.classList.add('hidden');
  };
  
  // Cancel handler
  const handleCancel = () => {
    // Cleanup
    window.currentVariantRowForUnits = null;
    window.currentVariantKey = null;
    
    // Restore default modal width
    if (modalContent) {
      modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
      modalContent.classList.add('max-w-md');
    }
    modal.classList.add('hidden');
  };
  
  // Remove old listeners and add new ones
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  newConfirmBtn.addEventListener('click', handleConfirm);
  
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  newCancelBtn.addEventListener('click', handleCancel);
  
  // Handle form submit
  const form = document.getElementById('add-variant-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleConfirm();
    });
  }
}

// Product Units Management (similar to variants)
async function addProductUnitRow(unit = null) {
  const unitsList = document.getElementById('product-units-list');
  const emptyMsg = document.getElementById('product-units-empty');
  if (!unitsList) return;
  
  // Hide empty message
  if (emptyMsg) emptyMsg.style.display = 'none';
  
  // Load suppliers
  const suppliers = await loadSuppliers();
  
  const row = document.createElement('tr');
  row.className = 'border-b border-gray-200';
  row.dataset.unitKey = unit ? `${unit.type}-${unit.unitName || unit.supplierId}` : Date.now().toString();
  
  const supplierOptions = suppliers.map(s => 
    `<option value="${s.id}">${escapeHtml(s.name)}</option>`
  ).join('');
  
  const selectedType = unit ? unit.type : '';
  const selectedUnit = unit ? (unit.unitName || unit.unidad || '') : '';
  const selectedSupplier = unit && unit.supplierId ? unit.supplierId : '';
  
  // Get type label
  const typeLabels = {
    'venta': 'Venta',
    'produccion': 'Producción',
    'compra': 'Compra'
  };
  const typeLabel = typeLabels[selectedType] || selectedType;
  
  // Get supplier name
  let supplierName = '';
  if (selectedType === 'compra' && selectedSupplier) {
    const supplier = suppliers.find(s => s.id === selectedSupplier);
    supplierName = supplier ? supplier.name : selectedSupplier;
  }
  
  // Get unit display name
  const unitDisplayName = selectedUnit || '-';
  
  row.innerHTML = `
    <td class="px-3 py-2 text-sm">${escapeHtml(typeLabel)}</td>
    <td class="px-3 py-2">
      <div class="text-sm">
        ${selectedType === 'compra' && supplierName ? `
          <div class="space-y-1">
            <div><span class="text-gray-600">Proveedor:</span> ${escapeHtml(supplierName)}</div>
            <div><span class="text-gray-600">Unidad:</span> ${escapeHtml(unitDisplayName)}</div>
          </div>
        ` : `
          <div>${escapeHtml(unitDisplayName)}</div>
        `}
      </div>
    </td>
    <td class="px-3 py-2">
      <div class="product-unit-conversions text-xs text-gray-600">
        <span class="text-gray-400 italic">Calculando...</span>
      </div>
    </td>
    <td class="px-3 py-2 text-center">
      <div class="flex gap-2 justify-center">
        <button type="button" class="edit-product-unit-btn px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" data-unit-key="${row.dataset.unitKey}">
          Editar
        </button>
        <button type="button" class="remove-product-unit-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors" data-unit-key="${row.dataset.unitKey}">
          Eliminar
        </button>
      </div>
    </td>
  `;
  
  // Store unit data in row for editing
  if (unit) {
    row.dataset.unitType = selectedType;
    row.dataset.unitName = selectedUnit;
    if (selectedSupplier) {
      row.dataset.unitSupplier = selectedSupplier;
    }
  }
  
  // Edit button handler
  const editBtn = row.querySelector('.edit-product-unit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', async () => {
      const unitData = {
        type: row.dataset.unitType,
        unitName: row.dataset.unitName,
        supplierId: row.dataset.unitSupplier || null
      };
      // Remove the row temporarily (will be re-added after edit)
      const unitKey = row.dataset.unitKey;
      row.remove();
      updateProductUnitsEmptyState();
      // Update conversions before showing modal
      updateAllProductUnitConversions();
      // Show modal with data
      await showEditProductUnitModal(unitData, unitKey);
    });
  }
  
  // Remove button handler
  const removeBtn = row.querySelector('.remove-product-unit-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      row.remove();
      updateProductUnitsEmptyState();
      updateAllProductUnitConversions();
    });
  }
  
  unitsList.appendChild(row);
  
  // Update conversions for this unit and all others
  updateAllProductUnitConversions();
}

// Collect product units from table
function collectProductUnits() {
  const tbody = document.getElementById('product-units-list');
  if (!tbody) return [];
  
  const units = [];
  const rows = tbody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const type = row.dataset.unitType;
    const unitName = row.dataset.unitName;
    const supplierId = row.dataset.unitSupplier;
    
    if (!type || !unitName) return;
    
    const unitData = { type, unitName };
    
    if (type === 'compra' && supplierId) {
      unitData.supplierId = supplierId;
    }
    
    units.push(unitData);
  });
  
  return units;
}

// Load product units to table
async function loadProductUnitsToTable(product) {
  const tbody = document.getElementById('product-units-list');
  const emptyMsg = document.getElementById('product-units-empty');
  
  if (!tbody) return;
  
  // Clear table
  tbody.innerHTML = '';
  if (emptyMsg) emptyMsg.style.display = 'block';
  
  const units = [];
  
  // Add venta unit
  if (product.unidadVenta) {
    const unitData = { type: 'venta', unitName: product.unidadVenta };
    units.push(unitData);
  }
  
  // Add produccion unit
  if (product.unidadProduccion) {
    const unitData = { type: 'produccion', unitName: product.unidadProduccion };
    units.push(unitData);
  }
  
  // Add compra units
  if (product.unidadesCompra && Array.isArray(product.unidadesCompra)) {
    product.unidadesCompra.forEach(pu => {
      const unitData = { 
        type: 'compra', 
        unitName: pu.unidad, 
        supplierId: pu.supplierId 
      };
      units.push(unitData);
    });
  }
  
  // Add units to table
  for (const unit of units) {
    await addProductUnitRow(unit);
  }
  
  updateProductUnitsEmptyState();
  
  // Update conversions after loading
  updateAllProductUnitConversions();
}

// Update empty state message
function updateProductUnitsEmptyState() {
  const tbody = document.getElementById('product-units-list');
  const emptyMsg = document.getElementById('product-units-empty');
  
  if (!tbody || !emptyMsg) return;
  
  if (tbody.children.length === 0) {
    emptyMsg.style.display = 'block';
  } else {
    emptyMsg.style.display = 'none';
  }
}

// Calculate conversions between product units
async function calculateProductUnitConversions() {
  const units = collectProductUnits();
  if (units.length < 2) {
    return {}; // Need at least 2 units for conversions
  }
  
  // Load measurement units from database to get conversion factors
  await loadMeasurementUnits();
  
  const conversions = {};
  const unitNames = units.map(u => u.unitName);
  
  // Build a map of unit names to their data for quick lookup
  const unitMap = new Map();
  units.forEach(u => {
    unitMap.set(u.unitName, u);
  });
  
  // For each unit, calculate conversions to all other units
  for (let i = 0; i < units.length; i++) {
    const fromUnit = units[i];
    const fromUnitName = fromUnit.unitName;
    conversions[fromUnitName] = [];
    
    for (let j = 0; j < units.length; j++) {
      if (i === j) continue; // Skip self
      
      const toUnit = units[j];
      const toUnitName = toUnit.unitName;
      
      // Try to find conversion factor
      let factor = null;
      
      // Strategy 1: Check measurement units database for direct conversions
      if (!factor && measurementUnitsCache) {
        const fromUnitData = measurementUnitsCache.find(u => u.name === fromUnitName);
        if (fromUnitData && fromUnitData.conversions && fromUnitData.conversions.length > 0) {
          const toUnitData = measurementUnitsCache.find(u => u.name === toUnitName);
          if (toUnitData) {
            // Find direct conversion
            const directConversion = fromUnitData.conversions.find(c => {
              const targetUnit = measurementUnitsCache.find(u => u.id === c.toUnitId);
              return targetUnit && targetUnit.name === toUnitName;
            });
            if (directConversion) {
              factor = directConversion.factor;
            }
          }
        }
      }
      
      // Strategy 2: Try reverse lookup (toUnit -> fromUnit)
      if (!factor && measurementUnitsCache) {
        const toUnitData = measurementUnitsCache.find(u => u.name === toUnitName);
        if (toUnitData && toUnitData.conversions && toUnitData.conversions.length > 0) {
          const fromUnitData = measurementUnitsCache.find(u => u.name === fromUnitName);
          if (fromUnitData) {
            const reverseConversion = toUnitData.conversions.find(c => {
              const targetUnit = measurementUnitsCache.find(u => u.id === c.toUnitId);
              return targetUnit && targetUnit.name === fromUnitName;
            });
            if (reverseConversion) {
              factor = 1 / reverseConversion.factor;
            }
          }
        }
      }
      
      if (factor && factor > 0) {
        conversions[fromUnitName].push({
          toUnit: toUnitName,
          factor: factor
        });
      }
    }
  }
  
  return conversions;
}

// Update conversions display for all product units
async function updateAllProductUnitConversions() {
  const tbody = document.getElementById('product-units-list');
  if (!tbody) return;
  
  const conversions = await calculateProductUnitConversions();
  const rows = tbody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const unitName = row.dataset.unitName;
    if (!unitName) return;
    
    const conversionsCell = row.querySelector('.product-unit-conversions');
    if (!conversionsCell) return;
    
    const unitConversions = conversions[unitName] || [];
    
    if (unitConversions.length === 0) {
      conversionsCell.innerHTML = '<span class="text-gray-400 italic">Sin conversiones</span>';
    } else {
      conversionsCell.innerHTML = unitConversions.map(conv => {
        return `<div class="text-xs">1 ${escapeHtml(unitName)} = ${conv.factor.toFixed(4)} ${escapeHtml(conv.toUnit)}</div>`;
      }).join('');
    }
  });
}

// Variant Units Management (same as products but for variants)
async function addVariantUnitRow(variantRow, unit = null) {
  // Support both modal variant row (with querySelector function) and regular variant row
  let unitsList = null;
  let emptyMsg = null;
  
  // Check if it's a modal variant row (has querySelector function)
  if (typeof variantRow.querySelector === 'function') {
    unitsList = variantRow.querySelector('.variant-units-list');
    emptyMsg = variantRow.querySelector('.variant-units-empty');
  } else {
    // Regular variant row
    unitsList = variantRow.querySelector('.variant-units-list');
    emptyMsg = variantRow.querySelector('.variant-units-empty');
  }
  
  if (!unitsList) return;
  
  // Hide empty message
  if (emptyMsg) emptyMsg.style.display = 'none';
  
  // Load suppliers
  const suppliers = await loadSuppliers();
  
  const row = document.createElement('tr');
  row.className = 'border-b border-gray-200';
  row.dataset.unitKey = unit ? `${unit.type}-${unit.unitName || unit.supplierId}` : Date.now().toString();
  
  const selectedType = unit ? unit.type : '';
  const selectedUnit = unit ? (unit.unitName || unit.unidad || '') : '';
  const selectedSupplier = unit && unit.supplierId ? unit.supplierId : '';
  
  // Get type label
  const typeLabels = {
    'venta': 'Venta',
    'produccion': 'Producción',
    'compra': 'Compra'
  };
  const typeLabel = typeLabels[selectedType] || selectedType;
  
  // Get supplier name
  let supplierName = '';
  if (selectedType === 'compra' && selectedSupplier) {
    const supplier = suppliers.find(s => s.id === selectedSupplier);
    supplierName = supplier ? supplier.name : selectedSupplier;
  }
  
  // Get unit display name
  const unitDisplayName = selectedUnit || '-';
  
  row.innerHTML = `
    <td class="px-3 py-2 text-sm">${escapeHtml(typeLabel)}</td>
    <td class="px-3 py-2">
      <div class="text-sm">
        ${selectedType === 'compra' && supplierName ? `
          <div class="space-y-1">
            <div><span class="text-gray-600">Proveedor:</span> ${escapeHtml(supplierName)}</div>
            <div><span class="text-gray-600">Unidad:</span> ${escapeHtml(unitDisplayName)}</div>
          </div>
        ` : `
          <div>${escapeHtml(unitDisplayName)}</div>
        `}
      </div>
    </td>
    <td class="px-3 py-2">
      <div class="variant-unit-conversions text-xs text-gray-600">
        <span class="text-gray-400 italic">Calculando...</span>
      </div>
    </td>
    <td class="px-3 py-2 text-center">
      <div class="flex gap-2 justify-center">
        <button type="button" class="edit-variant-unit-btn px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" data-unit-key="${row.dataset.unitKey}">
          Editar
        </button>
        <button type="button" class="remove-variant-unit-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors" data-unit-key="${row.dataset.unitKey}">
          Eliminar
        </button>
      </div>
    </td>
  `;
  
  // Store unit data in row for editing
  if (unit) {
    row.dataset.unitType = selectedType;
    row.dataset.unitName = selectedUnit;
    if (selectedSupplier) {
      row.dataset.unitSupplier = selectedSupplier;
    }
  }
  
  // Edit button handler
  const editBtn = row.querySelector('.edit-variant-unit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', async () => {
      const unitData = {
        type: row.dataset.unitType,
        unitName: row.dataset.unitName,
        supplierId: row.dataset.unitSupplier || null
      };
      // Remove the row temporarily (will be re-added after edit)
      const unitKey = row.dataset.unitKey;
      row.remove();
      updateVariantUnitsEmptyState(variantRow);
      // Update conversions before showing modal
      await updateAllVariantUnitConversions(variantRow);
      // Store variant row reference (preserve existing if in modal)
      if (!window.currentVariantRowForUnits) {
        window.currentVariantRowForUnits = variantRow;
      }
      // Show modal with data
      await showEditProductUnitModal(unitData, unitKey);
    });
  }
  
  // Remove button handler
  const removeBtn = row.querySelector('.remove-variant-unit-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      row.remove();
      updateVariantUnitsEmptyState(variantRow);
      updateAllVariantUnitConversions(variantRow);
    });
  }
  
  unitsList.appendChild(row);
  
  // Update conversions for this unit and all others
  await updateAllVariantUnitConversions(variantRow);
}

// Collect variant units from table
function collectVariantUnits(variantRow) {
  // Support both modal variant row (with querySelector function) and regular variant row
  let tbody = null;
  
  // Check if it's a modal variant row (has querySelector function)
  if (typeof variantRow.querySelector === 'function') {
    tbody = variantRow.querySelector('.variant-units-list');
  } else {
    // Regular variant row
    tbody = variantRow.querySelector('.variant-units-list');
  }
  
  if (!tbody) return [];
  
  const units = [];
  const rows = tbody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const type = row.dataset.unitType;
    const unitName = row.dataset.unitName;
    const supplierId = row.dataset.unitSupplier;
    
    if (!type || !unitName) return;
    
    const unitData = { type, unitName };
    
    if (type === 'compra' && supplierId) {
      unitData.supplierId = supplierId;
    }
    
    units.push(unitData);
  });
  
  return units;
}

// Load variant units to table
async function loadVariantUnitsToTable(variant, variantRow) {
  // Support both modal variant row (with querySelector function) and regular variant row
  let tbody = null;
  let emptyMsg = null;
  
  // Check if it's a modal variant row (has querySelector function)
  if (typeof variantRow.querySelector === 'function') {
    tbody = variantRow.querySelector('.variant-units-list');
    emptyMsg = variantRow.querySelector('.variant-units-empty');
  } else {
    // Regular variant row
    tbody = variantRow.querySelector('.variant-units-list');
    emptyMsg = variantRow.querySelector('.variant-units-empty');
  }
  
  if (!tbody) return;
  
  // Clear table
  tbody.innerHTML = '';
  if (emptyMsg) emptyMsg.style.display = 'block';
  
  const units = [];
  
  // Add venta unit
  if (variant.unidadVenta) {
    const unitData = { type: 'venta', unitName: variant.unidadVenta };
    units.push(unitData);
  }
  
  // Add produccion unit
  if (variant.unidadProduccion) {
    const unitData = { type: 'produccion', unitName: variant.unidadProduccion };
    units.push(unitData);
  }
  
  // Add compra units
  if (variant.unidadesCompra && Array.isArray(variant.unidadesCompra)) {
    variant.unidadesCompra.forEach(pu => {
      const unitData = { 
        type: 'compra', 
        unitName: pu.unidad, 
        supplierId: pu.supplierId 
      };
      units.push(unitData);
    });
  }
  
  // Add units to table
  for (const unit of units) {
    await addVariantUnitRow(variantRow, unit);
  }
  
  updateVariantUnitsEmptyState(variantRow);
  
  // Update conversions after loading
  await updateAllVariantUnitConversions(variantRow);
}

// Update empty state message for variant units
function updateVariantUnitsEmptyState(variantRow) {
  // Support both modal variant row (with querySelector function) and regular variant row
  let tbody = null;
  let emptyMsg = null;
  
  // Check if it's a modal variant row (has querySelector function)
  if (typeof variantRow.querySelector === 'function') {
    tbody = variantRow.querySelector('.variant-units-list');
    emptyMsg = variantRow.querySelector('.variant-units-empty');
  } else {
    // Regular variant row
    tbody = variantRow.querySelector('.variant-units-list');
    emptyMsg = variantRow.querySelector('.variant-units-empty');
  }
  
  if (!tbody || !emptyMsg) return;
  
  if (tbody.children.length === 0) {
    emptyMsg.style.display = 'block';
  } else {
    emptyMsg.style.display = 'none';
  }
}

// Calculate conversions between variant units
async function calculateVariantUnitConversions(variantRow) {
  const units = collectVariantUnits(variantRow);
  if (units.length < 2) {
    return {}; // Need at least 2 units for conversions
  }
  
  // Load measurement units from database to get conversion factors
  await loadMeasurementUnits();
  
  const conversions = {};
  const unitNames = units.map(u => u.unitName);
  
  // Build a map of unit names to their data for quick lookup
  const unitMap = new Map();
  units.forEach(u => {
    unitMap.set(u.unitName, u);
  });
  
  // For each unit, calculate conversions to all other units
  for (let i = 0; i < units.length; i++) {
    const fromUnit = units[i];
    const fromUnitName = fromUnit.unitName;
    conversions[fromUnitName] = [];
    
    for (let j = 0; j < units.length; j++) {
      if (i === j) continue; // Skip self
      
      const toUnit = units[j];
      const toUnitName = toUnit.unitName;
      
      // Try to find conversion factor (same logic as products)
      let factor = null;
      
      // Strategy 1: Check measurement units database for direct conversions
      if (!factor && measurementUnitsCache) {
        const fromUnitData = measurementUnitsCache.find(u => u.name === fromUnitName);
        if (fromUnitData && fromUnitData.conversions && fromUnitData.conversions.length > 0) {
          const toUnitData = measurementUnitsCache.find(u => u.name === toUnitName);
          if (toUnitData) {
            const directConversion = fromUnitData.conversions.find(c => {
              const targetUnit = measurementUnitsCache.find(u => u.id === c.toUnitId);
              return targetUnit && targetUnit.name === toUnitName;
            });
            if (directConversion) {
              factor = directConversion.factor;
            }
          }
        }
      }
      
      // Strategy 3: Try reverse lookup
      if (!factor && measurementUnitsCache) {
        const toUnitData = measurementUnitsCache.find(u => u.name === toUnitName);
        if (toUnitData && toUnitData.conversions && toUnitData.conversions.length > 0) {
          const fromUnitData = measurementUnitsCache.find(u => u.name === fromUnitName);
          if (fromUnitData) {
            const reverseConversion = toUnitData.conversions.find(c => {
              const targetUnit = measurementUnitsCache.find(u => u.id === c.toUnitId);
              return targetUnit && targetUnit.name === fromUnitName;
            });
            if (reverseConversion) {
              factor = 1 / reverseConversion.factor;
            }
          }
        }
      }
      
      // Strategy 4: Try conversion through common base unit
      if (!factor && measurementUnitsCache) {
        const fromUnitData = measurementUnitsCache.find(u => u.name === fromUnitName);
        const toUnitData = measurementUnitsCache.find(u => u.name === toUnitName);
        if (fromUnitData && toUnitData && fromUnitData.conversions && toUnitData.conversions) {
          // Find a common base unit
          for (const fromConv of fromUnitData.conversions) {
            const fromBaseUnit = measurementUnitsCache.find(u => u.id === fromConv.toUnitId);
            if (fromBaseUnit) {
              for (const toConv of toUnitData.conversions) {
                const toBaseUnit = measurementUnitsCache.find(u => u.id === toConv.toUnitId);
                if (toBaseUnit && fromBaseUnit.id === toBaseUnit.id) {
                  // Both convert to same base unit
                  factor = fromConv.factor / toConv.factor;
                  break;
                }
              }
            }
            if (factor) break;
          }
        }
      }
      
      if (factor && factor > 0) {
        conversions[fromUnitName].push({
          toUnit: toUnitName,
          factor: factor
        });
      }
    }
  }
  
  return conversions;
}

// Update all variant unit conversions in table
async function updateAllVariantUnitConversions(variantRow) {
  // Support both modal variant row (with querySelector function) and regular variant row
  let tbody = null;
  
  // Check if it's a modal variant row (has querySelector function)
  if (typeof variantRow.querySelector === 'function') {
    tbody = variantRow.querySelector('.variant-units-list');
  } else {
    // Regular variant row
    tbody = variantRow.querySelector('.variant-units-list');
  }
  
  if (!tbody) return;
  
  const conversions = await calculateVariantUnitConversions(variantRow);
  const rows = tbody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const unitName = row.dataset.unitName;
    if (!unitName) return;
    
    const conversionsCell = row.querySelector('.variant-unit-conversions');
    if (!conversionsCell) return;
    
    const unitConversions = conversions[unitName] || [];
    
    if (unitConversions.length === 0) {
      conversionsCell.innerHTML = '<span class="text-gray-400 italic">Sin conversiones</span>';
    } else {
      conversionsCell.innerHTML = unitConversions.map(conv => {
        return `<div class="text-xs">1 ${escapeHtml(unitName)} = ${conv.factor.toFixed(4)} ${escapeHtml(conv.toUnit)}</div>`;
      }).join('');
    }
  });
}

// Units management
let suppliersCache = null;

// Load suppliers for purchase units selector
async function loadSuppliers() {
  if (suppliersCache) return suppliersCache;
  try {
    const nrd = window.nrd;
    if (!nrd) {
      logger.error('NRD service not available');
      return [];
    }
    const suppliers = await nrd.suppliers.getAll();
    suppliersCache = Array.isArray(suppliers) ? suppliers : Object.values(suppliers || {});
    return suppliersCache;
  } catch (error) {
    logger.error('Failed to load suppliers', error);
    return [];
  }
}

// Measurement units cache
let measurementUnitsCache = null;

// Load measurement units from database
async function loadMeasurementUnits() {
  if (measurementUnitsCache) return measurementUnitsCache;
  
  try {
    const nrd = window.nrd;
    if (!nrd || !nrd.measurementUnits) {
      logger.warn('Measurement units service not available, using fallback');
      return [];
    }
    
    const units = await nrd.measurementUnits.getAll();
    measurementUnitsCache = Array.isArray(units) ? units : (units ? Object.values(units) : []);
    return measurementUnitsCache;
  } catch (error) {
    logger.error('Failed to load measurement units', error);
    return [];
  }
}

// Get unit options HTML (loads from database)
async function getUnitOptionsHTML(selectedUnit = '', type = null) {
  const units = await loadMeasurementUnits();
  
  // Filter by type if specified
  let filteredUnits = units;
  if (type) {
    filteredUnits = units.filter(u => u.type === type);
  }
  
  // If no units found, return empty or fallback
  if (filteredUnits.length === 0) {
    return selectedUnit ? `<option value="${selectedUnit}" selected>${escapeHtml(selectedUnit)}</option>` : '';
  }
  
  return filteredUnits.map(unit => 
    `<option value="${unit.name}" ${selectedUnit === unit.name ? 'selected' : ''}>${escapeHtml(unit.name)}</option>`
  ).join('');
}

// Get unit options HTML sync (for backwards compatibility, uses cache)
function getUnitOptionsHTMLSync(selectedUnit = '', type = null) {
  if (!measurementUnitsCache) {
    // Return empty if cache not loaded yet
    return selectedUnit ? `<option value="${selectedUnit}" selected>${escapeHtml(selectedUnit)}</option>` : '';
  }
  
  let filteredUnits = measurementUnitsCache;
  if (type) {
    filteredUnits = measurementUnitsCache.filter(u => u.type === type);
  }
  
  if (filteredUnits.length === 0) {
    return selectedUnit ? `<option value="${selectedUnit}" selected>${escapeHtml(selectedUnit)}</option>` : '';
  }
  
  return filteredUnits.map(unit => 
    `<option value="${unit.name}" ${selectedUnit === unit.name ? 'selected' : ''}>${escapeHtml(unit.name)}</option>`
  ).join('');
}

// Populate purchase unit modal select (type: 'compra') - still used in purchase unit modal
async function populatePurchaseUnitModalSelect() {
  await loadMeasurementUnits();
  
  const purchaseUnitUnidadSelect = document.getElementById('purchase-unit-unidad');
  if (purchaseUnitUnidadSelect) {
    const currentValue = purchaseUnitUnidadSelect.value;
    purchaseUnitUnidadSelect.innerHTML = '<option value="">Seleccione...</option>' + await getUnitOptionsHTML('', 'compra');
    if (currentValue) {
      purchaseUnitUnidadSelect.value = currentValue;
    }
  }
}

// Show purchase unit modal
let currentEditingPurchaseUnit = null;
async function showPurchaseUnitModal(purchaseUnit = null) {
  currentEditingPurchaseUnit = purchaseUnit;
  const modal = document.getElementById('purchase-unit-modal');
  const supplierSelect = document.getElementById('purchase-unit-supplier');
  const unidadSelect = document.getElementById('purchase-unit-unidad');
  const conversionsSection = document.getElementById('purchase-unit-conversions-section');
  const conversionsList = document.getElementById('purchase-unit-conversions-list');
  
  if (!modal || !supplierSelect || !unidadSelect) return;
  
  // Load suppliers
  const suppliers = await loadSuppliers();
  if (suppliers.length === 0) {
    await showError('No hay proveedores registrados. Debe crear proveedores primero.');
    return;
  }
  
  // Populate supplier select
  supplierSelect.innerHTML = '<option value="">Seleccione...</option>' + 
    suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  
  // Reset form
  unidadSelect.value = '';
  conversionsList.innerHTML = '';
  conversionsSection.classList.add('hidden');
  
  // If editing, populate fields
  if (purchaseUnit) {
    supplierSelect.value = purchaseUnit.supplierId || '';
    unidadSelect.value = purchaseUnit.unidad || '';
    supplierSelect.disabled = true; // Can't change supplier when editing
    
    // Trigger conversion update to show existing conversions
    setTimeout(() => {
      updatePurchaseUnitModalConversions();
      
      // Load existing conversion factors if any
      const existingConversions = collectConversions();
      if (existingConversions.length > 0 && purchaseUnit.unidad) {
        setTimeout(() => {
          existingConversions.forEach(conv => {
            if (conv.fromUnit === purchaseUnit.unidad || conv.toUnit === purchaseUnit.unidad) {
              const input = conversionsList.querySelector(
                `.purchase-unit-conversion-factor[data-from="${conv.fromUnit}"][data-to="${conv.toUnit}"]`
              ) || conversionsList.querySelector(
                `.purchase-unit-conversion-factor[data-from="${conv.toUnit}"][data-to="${conv.fromUnit}"]`
              );
              if (input) {
                // If reverse conversion, use 1/factor
                if (conv.fromUnit === purchaseUnit.unidad) {
                  input.value = conv.factor.toFixed(4);
                } else {
                  input.value = (1 / conv.factor).toFixed(4);
                }
              }
            }
          });
        }, 50);
      }
    }, 10);
  } else {
    supplierSelect.disabled = false;
  }
  
  // Show modal
  modal.classList.remove('hidden');
}

// Hide purchase unit modal
function hidePurchaseUnitModal() {
  const modal = document.getElementById('purchase-unit-modal');
  if (modal) modal.classList.add('hidden');
  currentEditingPurchaseUnit = null;
  
  // Reset form
  const supplierSelect = document.getElementById('purchase-unit-supplier');
  const unidadSelect = document.getElementById('purchase-unit-unidad');
  const conversionsSection = document.getElementById('purchase-unit-conversions-section');
  const conversionsList = document.getElementById('purchase-unit-conversions-list');
  
  if (supplierSelect) {
    supplierSelect.value = '';
    supplierSelect.disabled = false;
  }
  if (unidadSelect) unidadSelect.value = '';
  if (conversionsSection) conversionsSection.classList.add('hidden');
  if (conversionsList) conversionsList.innerHTML = '';
}

// Update conversions section in modal when unidad changes
function updatePurchaseUnitModalConversions() {
  const unidadSelect = document.getElementById('purchase-unit-unidad');
  const conversionsSection = document.getElementById('purchase-unit-conversions-section');
  const conversionsList = document.getElementById('purchase-unit-conversions-list');
  
  if (!unidadSelect || !conversionsSection || !conversionsList) return;
  
  const selectedUnidad = unidadSelect.value.trim();
  if (!selectedUnidad) {
    conversionsSection.classList.add('hidden');
    return;
  }
  
  // Get all existing units (venta, produccion, compra)
  // Get all units from product units table
  const productUnits = collectProductUnits();
  const allUnits = new Set();
  productUnits.forEach(u => {
    if (u.unitName) allUnits.add(u.unitName);
  });
  
  // Get existing purchase units (for modal compatibility)
  const existingPurchaseUnits = collectPurchaseUnits();
  existingPurchaseUnits.forEach(pu => {
    if (pu.unidad && pu.unidad !== selectedUnidad) {
      allUnits.add(pu.unidad);
    }
  });
  
  // Remove the currently selected unit
  allUnits.delete(selectedUnidad);
  
  // If there are 2+ different units, show conversions
  if (allUnits.size >= 1) {
    conversionsSection.classList.remove('hidden');
    conversionsList.innerHTML = '';
    
    allUnits.forEach(otherUnit => {
      const conversionRow = document.createElement('div');
      conversionRow.className = 'flex items-center gap-2 p-2 border border-gray-200 rounded';
      conversionRow.innerHTML = `
        <div class="flex-1 text-xs text-gray-600">
          1 ${escapeHtml(selectedUnidad)} = 
          <input type="number" 
            class="purchase-unit-conversion-factor border border-gray-300 rounded px-2 py-1 w-24 text-sm" 
            step="0.0001" min="0.0001" 
            placeholder="Factor"
            data-from="${selectedUnidad}" 
            data-to="${otherUnit}">
          ${escapeHtml(otherUnit)}
        </div>
      `;
      conversionsList.appendChild(conversionRow);
    });
  } else {
    conversionsSection.classList.add('hidden');
  }
}

// Add purchase unit (called from modal)
async function addPurchaseUnitRow(purchaseUnit = null) {
  // This function now opens the modal instead of directly adding
  await showPurchaseUnitModal(purchaseUnit);
}

// Save purchase unit from modal
async function savePurchaseUnitFromModal() {
  const supplierSelect = document.getElementById('purchase-unit-supplier');
  const unidadSelect = document.getElementById('purchase-unit-unidad');
  const conversionsList = document.getElementById('purchase-unit-conversions-list');
  
  if (!supplierSelect || !unidadSelect) return;
  
  const supplierId = supplierSelect.value.trim();
  const unidad = unidadSelect.value.trim();
  
  if (!supplierId || !unidad) {
    await showError('Por favor complete todos los campos requeridos');
    return;
  }
  
  // Check for duplicate supplier
  const existingUnits = collectPurchaseUnits();
  if (currentEditingPurchaseUnit) {
    // When editing, exclude current unit from duplicate check
    const otherUnits = existingUnits.filter(pu => pu.supplierId !== currentEditingPurchaseUnit.supplierId);
    if (otherUnits.some(pu => pu.supplierId === supplierId)) {
      await showError('Ya existe una unidad de compra para este proveedor');
      return;
    }
  } else {
    if (existingUnits.some(pu => pu.supplierId === supplierId)) {
      await showError('Ya existe una unidad de compra para este proveedor');
      return;
    }
  }
  
  // Collect conversions from modal and add them to general conversions
  if (conversionsList) {
    conversionsList.querySelectorAll('.purchase-unit-conversion-factor').forEach(input => {
      const factor = parseFloat(input.value.trim());
      if (!isNaN(factor) && factor > 0) {
        const fromUnit = input.dataset.from;
        const toUnit = input.dataset.to;
        
        // Add conversion to general conversions list if it doesn't exist
        const conversionsListEl = document.getElementById('conversions-list');
        if (conversionsListEl) {
          const existingConversion = conversionsListEl.querySelector(
            `[data-conversion-id="${fromUnit}-${toUnit}"]`
          );
          
          if (!existingConversion) {
            // Create conversion row
            const conversionRow = document.createElement('div');
            conversionRow.className = 'border border-gray-200 rounded p-2 sm:p-3 bg-gray-50';
            conversionRow.dataset.conversionId = `${fromUnit}-${toUnit}`;
            
            // Use addConversionRowWithoutUpdate to maintain consistency
            addConversionRowWithoutUpdate({
              fromUnit: fromUnit,
              toUnit: toUnit,
              factor: factor
            });
          } else {
            // Update existing conversion factor
            const factorInput = existingConversion.querySelector('.conversion-factor');
            if (factorInput) {
              factorInput.value = factor.toFixed(4);
            }
          }
        }
      }
    });
  }
  
  // Add or update purchase unit in table
  if (currentEditingPurchaseUnit) {
    // Update existing
    updatePurchaseUnitInTable(currentEditingPurchaseUnit.supplierId, { supplierId, unidad });
  } else {
    // Add new
    addPurchaseUnitToTable({ supplierId, unidad });
  }
  
  hidePurchaseUnitModal();
  
  // Regenerate conversions
  setTimeout(() => updateConversionsFromUnits(), 10);
}

// Add purchase unit to table
function addPurchaseUnitToTable(purchaseUnit) {
  const tbody = document.getElementById('purchase-units-list');
  const emptyMsg = document.getElementById('purchase-units-empty');
  
  if (!tbody) return;
  
  // Hide empty message
  if (emptyMsg) emptyMsg.style.display = 'none';
  
  // Load supplier name
  loadSuppliers().then(suppliers => {
    const supplier = suppliers.find(s => s.id === purchaseUnit.supplierId);
    const supplierName = supplier ? supplier.name : purchaseUnit.supplierId;
    
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-200 hover:bg-gray-50';
    row.dataset.supplierId = purchaseUnit.supplierId;
    row.dataset.unidad = purchaseUnit.unidad;
    
    row.innerHTML = `
      <td class="px-3 py-2 text-sm">${escapeHtml(supplierName)}</td>
      <td class="px-3 py-2 text-sm">${escapeHtml(purchaseUnit.unidad)}</td>
      <td class="px-3 py-2 text-center">
        <button type="button" class="edit-purchase-unit-btn text-blue-600 hover:text-blue-800 text-xs mr-2" data-supplier-id="${purchaseUnit.supplierId}">
          Editar
        </button>
        <button type="button" class="remove-purchase-unit-btn text-red-600 hover:text-red-800 text-xs" data-supplier-id="${purchaseUnit.supplierId}">
          ×
        </button>
      </td>
    `;
    
    // Add event listeners
    const editBtn = row.querySelector('.edit-purchase-unit-btn');
    const removeBtn = row.querySelector('.remove-purchase-unit-btn');
    
    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        const existingUnits = collectPurchaseUnits();
        const unit = existingUnits.find(pu => pu.supplierId === purchaseUnit.supplierId);
        if (unit) {
          await showPurchaseUnitModal(unit);
        }
      });
    }
    
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        updatePurchaseUnitsTableEmptyState();
        setTimeout(() => updateConversionsFromUnits(), 10);
      });
    }
    
    tbody.appendChild(row);
  });
}

// Update purchase unit in table
function updatePurchaseUnitInTable(oldSupplierId, purchaseUnit) {
  const row = document.querySelector(`tr[data-supplier-id="${oldSupplierId}"]`);
  if (!row) return;
  
  // Update data attributes
  row.dataset.supplierId = purchaseUnit.supplierId;
  row.dataset.unidad = purchaseUnit.unidad;
  
  // Update supplier name
  loadSuppliers().then(suppliers => {
    const supplier = suppliers.find(s => s.id === purchaseUnit.supplierId);
    const supplierName = supplier ? supplier.name : purchaseUnit.supplierId;
    
    row.innerHTML = `
      <td class="px-3 py-2 text-sm">${escapeHtml(supplierName)}</td>
      <td class="px-3 py-2 text-sm">${escapeHtml(purchaseUnit.unidad)}</td>
      <td class="px-3 py-2 text-center">
        <button type="button" class="edit-purchase-unit-btn text-blue-600 hover:text-blue-800 text-xs mr-2" data-supplier-id="${purchaseUnit.supplierId}">
          Editar
        </button>
        <button type="button" class="remove-purchase-unit-btn text-red-600 hover:text-red-800 text-xs" data-supplier-id="${purchaseUnit.supplierId}">
          ×
        </button>
      </td>
    `;
    
    // Re-attach event listeners
    const editBtn = row.querySelector('.edit-purchase-unit-btn');
    const removeBtn = row.querySelector('.remove-purchase-unit-btn');
    
    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        const existingUnits = collectPurchaseUnits();
        const unit = existingUnits.find(pu => pu.supplierId === purchaseUnit.supplierId);
        if (unit) {
          await showPurchaseUnitModal(unit);
        }
      });
    }
    
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        updatePurchaseUnitsTableEmptyState();
        setTimeout(() => updateConversionsFromUnits(), 10);
      });
    }
  });
}

// Update empty state of purchase units table
function updatePurchaseUnitsTableEmptyState() {
  const tbody = document.getElementById('purchase-units-list');
  const emptyMsg = document.getElementById('purchase-units-empty');
  
  if (!tbody || !emptyMsg) return;
  
  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) {
    emptyMsg.style.display = 'block';
  } else {
    emptyMsg.style.display = 'none';
  }
}

// Render purchase units table
async function renderPurchaseUnitsTable(purchaseUnits = []) {
  const tbody = document.getElementById('purchase-units-list');
  const emptyMsg = document.getElementById('purchase-units-empty');
  
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (purchaseUnits.length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }
  
  if (emptyMsg) emptyMsg.style.display = 'none';
  
  const suppliers = await loadSuppliers();
  
  purchaseUnits.forEach(pu => {
    const supplier = suppliers.find(s => s.id === pu.supplierId);
    const supplierName = supplier ? supplier.name : pu.supplierId;
    
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-200 hover:bg-gray-50';
    row.dataset.supplierId = pu.supplierId;
    row.dataset.unidad = pu.unidad;
    
    row.innerHTML = `
      <td class="px-3 py-2 text-sm">${escapeHtml(supplierName)}</td>
      <td class="px-3 py-2 text-sm">${escapeHtml(pu.unidad)}</td>
      <td class="px-3 py-2 text-center">
        <button type="button" class="edit-purchase-unit-btn text-blue-600 hover:text-blue-800 text-xs mr-2" data-supplier-id="${pu.supplierId}">
          Editar
        </button>
        <button type="button" class="remove-purchase-unit-btn text-red-600 hover:text-red-800 text-xs" data-supplier-id="${pu.supplierId}">
          ×
        </button>
      </td>
    `;
    
    // Add event listeners
    const editBtn = row.querySelector('.edit-purchase-unit-btn');
    const removeBtn = row.querySelector('.remove-purchase-unit-btn');
    
    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        await showPurchaseUnitModal(pu);
      });
    }
    
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        row.remove();
        updatePurchaseUnitsTableEmptyState();
        setTimeout(() => updateConversionsFromUnits(), 10);
      });
    }
    
    tbody.appendChild(row);
  });
}

// Collect purchase units
function collectPurchaseUnits() {
  const tbody = document.getElementById('purchase-units-list');
  if (!tbody) return [];
  
  const purchaseUnits = [];
  const rows = tbody.querySelectorAll('tr[data-supplier-id]');
  
  rows.forEach(row => {
    const supplierId = row.dataset.supplierId;
    const unidad = row.dataset.unidad;
    
    if (!supplierId || !unidad) return;
    
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
          ${getUnitOptionsHTMLSync(conversion ? conversion.fromUnit : '')}
        </select>
      </div>
      <div class="sm:col-span-3">
        <label class="block text-xs text-gray-600 mb-1">A</label>
        <select class="conversion-to w-full px-2 py-1.5 border border-gray-300 rounded text-sm" required>
          <option value="">Seleccione...</option>
          ${getUnitOptionsHTMLSync(conversion ? conversion.toUnit : '')}
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

// Get all unique units from the product form (from table)
function getAllUniqueUnits() {
  const units = new Set();
  
  // Get units from product units table
  const productUnits = collectProductUnits();
  productUnits.forEach(u => {
    if (u.unitName) units.add(u.unitName);
  });
  
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

      const user = (window.authService && window.authService.getCurrentUser && window.authService.getCurrentUser()) || null;
  logger.info('Deleting product', { productId });
  showSpinner('Eliminando producto...');
  try {
    const nrd = window.nrd;
    if (!nrd) {
      await (window.showError || alert)('Servicio no disponible');
      return;
    }
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
  
  // Add variant button handler - opens modal
  const addVariantBtn = document.getElementById('add-variant-btn');
  if (addVariantBtn) {
    addVariantBtn.addEventListener('click', async () => {
      await showEditVariantModal();
    });
  }
  
  // Add product unit button handler
  const addProductUnitBtn = document.getElementById('add-product-unit-btn');
  if (addProductUnitBtn) {
    addProductUnitBtn.addEventListener('click', async () => {
      await showAddProductUnitModal();
    });
  }
  
  
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const productId = document.getElementById('product-id').value;
    const name = document.getElementById('product-name').value.trim();
    const sku = document.getElementById('product-sku').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const costInput = document.getElementById('product-cost');
    const costValue = costInput.value.trim();
    const esProducible = document.getElementById('product-es-producible').checked;
    const active = document.getElementById('product-active').checked;
    
    // If producible and has recipe, calculate cost from recipe (don't use input value)
    let cost = undefined;
    if (esProducible && productId) {
      const nrd = window.nrd;
      if (nrd && nrd.products) {
        try {
          const product = await nrd.products.getById(productId);
          if (product && product.recipeId) {
            // Calculate cost from recipe
            const calculatedCost = await calculateProductCostFromRecipe(product);
            if (calculatedCost !== null) {
              cost = calculatedCost;
            } else {
              // Fallback to input value if calculation fails
              cost = costValue ? parseFloat(costValue) : undefined;
            }
          } else {
            // No recipe, use input value
            cost = costValue ? parseFloat(costValue) : undefined;
          }
        } catch (e) {
          logger.warn('Could not calculate cost from recipe, using input value', e);
          cost = costValue ? parseFloat(costValue) : undefined;
        }
      } else {
        // Services not available, use input value
        cost = costValue ? parseFloat(costValue) : undefined;
      }
    } else {
      // Not producible or new product, use input value
      cost = costValue ? parseFloat(costValue) : undefined;
    }
    
    // Get roles
    const esVendible = document.getElementById('product-es-vendible').checked;
    const esComprable = document.getElementById('product-es-comprable').checked;
    const esInsumo = document.getElementById('product-es-insumo').checked;
    // esProducible already defined above

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
    
    // Collect units from table
    const productUnits = collectProductUnits();
    
    // Calculate and collect conversions
    const conversions = await calculateProductUnitConversions();
    
    // Organize units by type
    const ventaUnit = productUnits.find(u => u.type === 'venta');
    const produccionUnit = productUnits.find(u => u.type === 'produccion');
    const compraUnits = productUnits.filter(u => u.type === 'compra');
    
    const unidadVenta = ventaUnit?.unitName || '';
    const unidadProduccion = produccionUnit?.unitName || '';
    const unidadesCompra = compraUnits.map(u => {
      return {
        supplierId: u.supplierId,
        unidad: u.unitName
      };
    });
    
    // Convert conversions object to array format for storage
    const conversionesArray = [];
    Object.keys(conversions).forEach(fromUnit => {
      conversions[fromUnit].forEach(conv => {
        conversionesArray.push({
          fromUnit: fromUnit,
          toUnit: conv.toUnit,
          factor: conv.factor
        });
      });
    });

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
      if (unidadesCompra.length > 0) {
        productData.unidadesCompra = unidadesCompra;
      }
      if (conversionesArray.length > 0) {
        productData.conversiones = conversionesArray;
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

// Setup product event listeners (called from initializeProducts)
function setupProductEventListeners() {
  // Setup product form handler (includes variant button and submit)
  setupProductFormHandler();
  // Back to products button
  const backToProductsBtn = document.getElementById('back-to-products');
  if (backToProductsBtn) {
    const newBtn = backToProductsBtn.cloneNode(true);
    backToProductsBtn.parentNode.replaceChild(newBtn, backToProductsBtn);
    newBtn.addEventListener('click', () => {
      backToProducts();
    });
  }

  // Close product detail button
  const closeProductDetailBtn = document.getElementById('close-product-detail-btn');
  if (closeProductDetailBtn) {
    const newBtn = closeProductDetailBtn.cloneNode(true);
    closeProductDetailBtn.parentNode.replaceChild(newBtn, closeProductDetailBtn);
    newBtn.addEventListener('click', () => {
      backToProducts();
    });
  }

  // Close product form button
  const closeProductFormBtn = document.getElementById('close-product-form');
  if (closeProductFormBtn) {
    const newBtn = closeProductFormBtn.cloneNode(true);
    closeProductFormBtn.parentNode.replaceChild(newBtn, closeProductFormBtn);
    newBtn.addEventListener('click', () => {
      hideProductForm();
    });
  }

  // Cancel product form button
  const cancelProductBtn = document.getElementById('cancel-product-btn');
  if (cancelProductBtn) {
    const newBtn = cancelProductBtn.cloneNode(true);
    cancelProductBtn.parentNode.replaceChild(newBtn, cancelProductBtn);
    newBtn.addEventListener('click', () => {
      hideProductForm();
    });
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
        <p class="text-sm text-gray-600">Seleccione un archivo CSV con tres columnas: <strong>Código</strong> (SKU), <strong>Artículo</strong> (nombre) y <strong>Contado</strong> (precio)</p>
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
    // Normalize header to handle encoding issues (remove accents, convert to lowercase)
    const normalizeText = (text) => {
      return text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .trim();
    };
    
    const header = lines[0].split(';').map(h => h.trim());
    const normalizedHeader = header.map(h => normalizeText(h));
    
    // Search for columns with flexible matching (handles encoding issues with accents)
    const codigoIndex = normalizedHeader.findIndex(h => 
      h === 'codigo' || h === 'cod' || h.startsWith('codig')
    );
    const articuloIndex = normalizedHeader.findIndex(h => 
      h === 'articulo' || h === 'art' || h.startsWith('articul')
    );
    const contadoIndex = normalizedHeader.findIndex(h => 
      h === 'contado' || h === 'precio' || h.startsWith('contad')
    );

    if (codigoIndex === -1 || articuloIndex === -1 || contadoIndex === -1) {
      const missingColumns = [];
      if (codigoIndex === -1) missingColumns.push('Código');
      if (articuloIndex === -1) missingColumns.push('Artículo');
      if (contadoIndex === -1) missingColumns.push('Contado');
      
      await showError(`El CSV debe tener las columnas: ${missingColumns.join(', ')}. Columnas encontradas: ${header.join(', ')}`);
      return null;
    }

    // Get existing products to check which will be updated vs created using NRD Data Access
    const nrd = window.nrd;
    if (!nrd) {
      await (window.showError || alert)('Servicio no disponible');
      return null;
    }
    const existingProductsArray = await nrd.products.getAll();
    const existingProducts = Array.isArray(existingProductsArray) 
      ? existingProductsArray.reduce((acc, product, index) => {
          acc[index] = product;
          return acc;
        }, {})
      : existingProductsArray || {};
    
    // Create a map of existing products by SKU (exact match)
    // SKU is the key for finding existing products
    const existingProductsMap = {};
    Object.entries(existingProducts).forEach(([id, product]) => {
      if (product.sku) {
        existingProductsMap[product.sku] = { id, ...product };
      }
    });

    const products = [];
    const errors = [];

    // Process each line (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(';').map(col => col.trim());
      const sku = columns[codigoIndex];
      const name = columns[articuloIndex];
      const priceStr = columns[contadoIndex];

      if (!sku) {
        errors.push(`Línea ${i + 1}: Código (SKU) vacío`);
        continue;
      }

      if (!name) {
        errors.push(`Línea ${i + 1}: Nombre de producto vacío`);
        continue;
      }

      const price = parseFloat(priceStr);
      if (isNaN(price) || price < 0) {
        errors.push(`Línea ${i + 1}: Precio inválido para "${name}" (SKU: ${sku})`);
        continue;
      }

      const exists = !!existingProductsMap[sku];
      const currentPrice = exists ? parseFloat(existingProductsMap[sku].price) : null;
      const priceEqual = exists && currentPrice !== null && parseFloat(price) === currentPrice;
      
      products.push({
        sku,
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
                <th class="px-3 py-2 text-left text-xs uppercase tracking-wider text-gray-600 border-b">Código (SKU)</th>
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
          <td class="px-3 py-2 font-mono text-xs">${escapeHtml(product.sku)}</td>
          <td class="px-3 py-2">${escapeHtml(product.name)}</td>
          <td class="px-3 py-2 ${priceClass} font-medium">$${parseFloat(product.price).toFixed(2)}</td>
        </tr>
      `;
    });
    
    if (preview.products.length > 20) {
      previewHTML += `
        <tr>
          <td colspan="3" class="px-3 py-2 text-center text-xs text-gray-500">
            ... y ${preview.products.length - 20} productos más
          </td>
        </tr>
      `;
    }
    
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
  const nrd = window.nrd;
  if (!nrd) {
    await (window.showError || alert)('Servicio no disponible');
    return;
  }
  
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
    
    // Create a map of existing products by SKU (exact match)
    // SKU is the key for finding existing products
    const existingProductsMap = {};
    Object.entries(existingProducts).forEach(([id, product]) => {
      if (product.sku) {
        existingProductsMap[product.sku] = { id, ...product };
      }
    });

    let added = 0;
    let updated = 0;
    const errors = preview.errors || [];

    // Process each product from preview
    for (const product of preview.products) {
      try {
        if (product.exists) {
          // Update existing product (name, price, and mark as vendible)
          await nrd.products.update(existingProductsMap[product.sku].id, {
            name: product.name,
            price: product.price,
            esVendible: true
          });
          updated++;
        } else {
          // Create new product with SKU and mark as vendible
          await nrd.products.create({
            sku: product.sku,
            name: product.name,
            price: product.price,
            active: true,
            esVendible: true
          });
          added++;
        }
      } catch (error) {
        errors.push(`Error al procesar "${product.name}" (SKU: ${product.sku}): ${error.message}`);
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


/**
 * Initialize products view
 */
export function initializeProducts() {
  // Preload measurement units cache
  loadMeasurementUnits().catch(err => {
    logger.warn('Failed to preload measurement units', err);
  });
  
  // Setup search input handler
  const productsSearchInput = document.getElementById('products-search-input');
  if (productsSearchInput) {
    // Remove existing listeners by cloning
    const newInput = productsSearchInput.cloneNode(true);
    productsSearchInput.parentNode.replaceChild(newInput, productsSearchInput);
    
    newInput.addEventListener('input', (e) => {
      productsSearchTerm = e.target.value;
      loadProducts();
    });
  }
  
  // Setup button handlers
  const newProductBtn = document.getElementById('new-product-btn');
  if (newProductBtn) {
    const newBtn = newProductBtn.cloneNode(true);
    newProductBtn.parentNode.replaceChild(newBtn, newProductBtn);
    newBtn.addEventListener('click', () => {
      showProductForm();
    });
  }
  
  const importProductsBtn = document.getElementById('import-products-btn');
  if (importProductsBtn) {
    const newBtn = importProductsBtn.cloneNode(true);
    importProductsBtn.parentNode.replaceChild(newBtn, importProductsBtn);
    newBtn.addEventListener('click', async () => {
      await importProductsFromCSV();
    });
  }
  
  // Setup product event listeners
  setupProductEventListeners();
  
  // Load products
  loadProducts();
}

