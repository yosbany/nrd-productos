// Measurement Units management (ES Module)
// Using NRDCommon from CDN (loaded in index.html)
const logger = window.logger || console;
const escapeHtml = window.escapeHtml || ((text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
});

let measurementUnitsListener = null;
let allMeasurementUnits = [];

// Load measurement units
function loadMeasurementUnits() {
  logger.debug('Loading measurement units');
  const unitsList = document.getElementById('measurement-units-list');
  if (!unitsList) {
    logger.warn('Measurement units list element not found');
    return;
  }
  
  unitsList.innerHTML = '';

  // Remove previous listener
  if (measurementUnitsListener) {
    logger.debug('Removing previous measurement units listener');
    measurementUnitsListener();
    measurementUnitsListener = null;
  }

  // Get nrd instance dynamically
  const nrd = window.nrd;
  if (!nrd) {
    logger.error('NRD service not available');
    unitsList.innerHTML = '<div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8"><p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">Error: Servicio NRD no disponible</p></div>';
    return;
  }
  
  // Check if measurementUnits service is available
  if (!nrd.measurementUnits) {
    logger.error('MeasurementUnits service not available. The nrd-data-access library may need to be rebuilt.', {
      nrdKeys: Object.keys(nrd),
      nrdType: typeof nrd,
      measurementUnitsType: typeof nrd.measurementUnits
    });
    unitsList.innerHTML = '<div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8"><p class="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">Error: El servicio de unidades de medida no está disponible. Por favor, reconstruya la librería nrd-data-access o recargue la página.</p></div>';
    return;
  }
  
  // Listen for measurement units using NRD Data Access
  logger.debug('Setting up measurement units listener');
  measurementUnitsListener = nrd.measurementUnits.onValue((units) => {
    logger.debug('Measurement units data received', { count: Array.isArray(units) ? units.length : Object.keys(units || {}).length });
    if (!unitsList) return;
    
    // Convert to array if needed
    allMeasurementUnits = Array.isArray(units) ? units : (units ? Object.values(units) : []);
    
    const unitsToShow = allMeasurementUnits;
    
    if (unitsToShow.length === 0) {
      unitsList.innerHTML = `
        <tr>
          <td colspan="4" class="px-3 py-8 text-center text-gray-600 text-sm">
            No hay unidades de medida registradas
          </td>
        </tr>
      `;
      return;
    }

    unitsToShow.forEach((unit) => {
      const row = document.createElement('tr');
      row.className = 'border-b border-gray-200 hover:bg-gray-50';
      row.dataset.unitId = unit.id;
      
      const conversionsCount = unit.conversions ? unit.conversions.length : 0;
      
      row.innerHTML = `
        <td class="px-3 py-2 text-gray-900">
          <div class="font-medium">${escapeHtml(unit.name || 'Sin nombre')}</div>
        </td>
        <td class="px-3 py-2 text-gray-600 text-sm font-mono">
          ${escapeHtml(unit.acronym || '-')}
        </td>
        <td class="px-3 py-2 text-gray-600 text-sm">
          ${conversionsCount > 0 ? `${conversionsCount} conversión${conversionsCount !== 1 ? 'es' : ''}` : 'Sin conversiones'}
        </td>
        <td class="px-3 py-2 text-center">
          <div class="flex gap-2 justify-center">
            <button class="edit-unit-btn px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors" data-unit-id="${unit.id}">
              Editar
            </button>
            <button class="delete-unit-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors" data-unit-id="${unit.id}">
              Eliminar
            </button>
          </div>
        </td>
      `;
      
      // Add edit button handler
      const editBtn = row.querySelector('.edit-unit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showMeasurementUnitForm(unit.id);
        });
      }
      
      // Add delete button handler
      const deleteBtn = row.querySelector('.delete-unit-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteMeasurementUnitHandler(unit.id);
        });
      }
      
      unitsList.appendChild(row);
    });
  });
}

// Show measurement unit form in modal
function showMeasurementUnitForm(unitId = null) {
  const modal = document.getElementById('custom-modal');
  const modalContent = document.getElementById('modal-content');
  const titleEl = document.getElementById('modal-title');
  const messageEl = document.getElementById('modal-message');
  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn = document.getElementById('modal-cancel');
  const closeBtn = document.getElementById('modal-close');
  
  if (!modal || !modalContent || !titleEl || !messageEl) return;
  
  // Make modal wider for measurement units
  modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
  modalContent.classList.add('max-w-3xl');
  
  // Create form HTML
  let formHTML = `
    <form id="measurement-unit-form-element" class="space-y-4">
      <input type="hidden" id="measurement-unit-id" value="${unitId || ''}">
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Nombre *</label>
        <input type="text" id="measurement-unit-name" required 
          class="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 bg-white text-sm rounded"
          placeholder="Ej: Kilogramo, Unidad">
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Acrónimo *</label>
        <input type="text" id="measurement-unit-acronym" required
          class="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-red-600 bg-white text-sm rounded uppercase"
          placeholder="Ej: KG, UN"
          maxlength="10">
      </div>
      <div>
        <label class="block mb-1.5 text-xs uppercase tracking-wider text-gray-600">Conversiones a Otras Unidades</label>
        <p class="text-xs text-gray-500 mb-2">Defina las conversiones de esta unidad a otras unidades de medida registradas.</p>
        <div class="mb-2 space-y-2">
          <div class="flex gap-2">
            <select id="conversion-to-unit" 
              class="flex-1 px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600">
              <option value="">Seleccione unidad...</option>
            </select>
            <input type="number" id="conversion-factor" step="0.0001" min="0.0001" 
              placeholder="Factor"
              class="w-24 px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600">
            <button type="button" id="add-conversion-btn" 
              class="px-3 py-2 text-xs bg-gray-200 text-gray-700 border border-gray-300 rounded hover:bg-gray-300 transition-colors">
              Agregar
            </button>
          </div>
        </div>
        <div id="conversions-list" class="space-y-2">
          <!-- Las conversiones se agregarán dinámicamente aquí -->
        </div>
      </div>
    </form>
  `;
  
  titleEl.textContent = unitId ? 'Editar Unidad de Medida' : 'Nueva Unidad de Medida';
  messageEl.innerHTML = formHTML;
  confirmBtn.textContent = 'Guardar';
  cancelBtn.textContent = 'Cancelar';
  confirmBtn.style.display = 'block';
  
  // Define handlers first (before showing modal)
  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const id = document.getElementById('measurement-unit-id').value;
    const name = document.getElementById('measurement-unit-name').value.trim();
    const acronym = document.getElementById('measurement-unit-acronym').value.trim().toUpperCase();
    
    logger.debug('Saving measurement unit - form values', { id, name, acronym });
    
    if (!name) {
      await window.showError?.('El nombre es requerido');
      return;
    }
    
    if (!acronym) {
      await window.showError?.('El acrónimo es requerido');
      return;
    }
    
    logger.debug('Saving measurement unit - validated', { id, name, acronym });
    
    window.showSpinner?.('Guardando unidad de medida...');
    try {
      await saveMeasurementUnit(id || null, { name, acronym });
      // Restore default modal width
      if (modalContent) {
        modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
        modalContent.classList.add('max-w-md');
      }
      modal.classList.add('hidden');
    } catch (error) {
      await window.showError?.(error.message || 'Error al guardar la unidad de medida');
    } finally {
      window.hideSpinner?.();
    }
  };
  
  const handleConfirm = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const form = document.getElementById('measurement-unit-form-element');
    if (form) {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  };
  
  const handleCancel = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Restore default modal width
    if (modalContent) {
      modalContent.classList.remove('max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl');
      modalContent.classList.add('max-w-md');
    }
    modal.classList.add('hidden');
  };
  
  // Remove old listeners by cloning buttons (prevents duplicate listeners)
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  newConfirmBtn.addEventListener('click', handleConfirm);
  
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  newCancelBtn.addEventListener('click', handleCancel);
  
  // Handle close button - get it again after cloning (in case it was affected)
  const currentCloseBtn = document.getElementById('modal-close');
  if (currentCloseBtn) {
    const newCloseBtn = currentCloseBtn.cloneNode(true);
    currentCloseBtn.parentNode.replaceChild(newCloseBtn, currentCloseBtn);
    newCloseBtn.addEventListener('click', handleCancel);
  }
  
  // Show modal after setting up handlers
  modal.classList.remove('hidden');
  
  // Setup form handler
  const form = document.getElementById('measurement-unit-form-element');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }
  
  // Populate conversion select
  populateConversionToUnitSelect(unitId);
  
  // Load unit data if editing
  if (unitId) {
    const nrd = window.nrd;
    if (nrd && nrd.measurementUnits) {
      nrd.measurementUnits.getById(unitId).then((unit) => {
        if (!unit) return;
        
        document.getElementById('measurement-unit-name').value = unit.name || '';
        document.getElementById('measurement-unit-acronym').value = unit.acronym || '';
        
        // Load conversions
        if (unit.conversions && unit.conversions.length > 0) {
          renderConversions(unit.conversions);
        }
      }).catch((error) => {
        logger.error('Error loading measurement unit', error);
        window.showError?.('Error al cargar la unidad de medida');
      });
    }
  }
  
  // Setup add conversion button
  const addConversionBtn = document.getElementById('add-conversion-btn');
  if (addConversionBtn) {
    addConversionBtn.addEventListener('click', () => {
      addConversion();
    });
  }
}

// Render conversions
function renderConversions(conversions) {
  const conversionsList = document.getElementById('conversions-list');
  if (!conversionsList) return;
  
  conversionsList.innerHTML = '';
  
  if (!conversions || conversions.length === 0) {
    return;
  }
  
  conversions.forEach((conversion, index) => {
    const conversionItem = document.createElement('div');
    conversionItem.className = 'flex items-center gap-2 p-2 border border-gray-200 rounded';
    conversionItem.dataset.toUnitId = conversion.toUnitId;
    conversionItem.dataset.factor = conversion.factor.toString();
    
    // Get target unit name
    const targetUnit = allMeasurementUnits.find(u => u.id === conversion.toUnitId);
    const targetUnitName = targetUnit ? targetUnit.name : conversion.toUnitId;
    
    conversionItem.innerHTML = `
      <div class="flex-1">
        <span class="text-sm text-gray-700">${escapeHtml(targetUnitName)}</span>
        <span class="text-xs text-gray-500 ml-2">Factor: ${escapeHtml(conversion.factor.toString())}</span>
      </div>
      <button type="button" class="remove-conversion-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
        Eliminar
      </button>
    `;
    
    const removeBtn = conversionItem.querySelector('.remove-conversion-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        conversionItem.remove();
      });
    }
    
    conversionsList.appendChild(conversionItem);
  });
}

// Add conversion
function addConversion() {
  const toUnitSelect = document.getElementById('conversion-to-unit');
  const factorInput = document.getElementById('conversion-factor');
  
  if (!toUnitSelect || !factorInput) return;
  
  const toUnitId = toUnitSelect.value;
  const factor = parseFloat(factorInput.value);
  
  if (!toUnitId || isNaN(factor) || factor <= 0) {
    window.showError?.('Por favor complete todos los campos correctamente');
    return;
  }
  
  // Get current conversions
  const conversionsList = document.getElementById('conversions-list');
  if (!conversionsList) return;
  
  const existingConversions = Array.from(conversionsList.children).map(item => {
    const toUnitId = item.querySelector('[data-to-unit-id]')?.dataset.toUnitId;
    const factor = parseFloat(item.querySelector('[data-factor]')?.dataset.factor);
    return { toUnitId, factor };
  }).filter(c => c.toUnitId && !isNaN(c.factor));
  
  // Check if conversion already exists
  if (existingConversions.some(c => c.toUnitId === toUnitId)) {
    window.showError?.('Ya existe una conversión a esta unidad');
    return;
  }
  
  // Add conversion
  const conversionItem = document.createElement('div');
  conversionItem.className = 'flex items-center gap-2 p-2 border border-gray-200 rounded';
  conversionItem.dataset.toUnitId = toUnitId;
  conversionItem.dataset.factor = factor.toString();
  
  const targetUnit = allMeasurementUnits.find(u => u.id === toUnitId);
  const targetUnitName = targetUnit ? targetUnit.name : toUnitId;
  
  conversionItem.innerHTML = `
    <div class="flex-1">
      <span class="text-sm text-gray-700">${escapeHtml(targetUnitName)}</span>
      <span class="text-xs text-gray-500 ml-2">Factor: ${escapeHtml(factor.toString())}</span>
    </div>
    <button type="button" class="remove-conversion-btn px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
      Eliminar
    </button>
  `;
  
  const removeBtn = conversionItem.querySelector('.remove-conversion-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      conversionItem.remove();
    });
  }
  
  conversionsList.appendChild(conversionItem);
  
  // Reset inputs
  toUnitSelect.value = '';
  factorInput.value = '';
}

// Save measurement unit
async function saveMeasurementUnit(unitId, unitData) {
  const nrd = window.nrd;
  if (!nrd || !nrd.measurementUnits) {
    throw new Error('NRD service not available');
  }
  
  try {
    // Collect conversions
    const conversionsList = document.getElementById('conversions-list');
    const conversions = [];
    if (conversionsList) {
      Array.from(conversionsList.children).forEach(item => {
        const toUnitId = item.dataset.toUnitId;
        const factorText = item.querySelector('[data-factor]')?.dataset.factor || 
                          item.textContent.match(/Factor:\s*([\d.]+)/)?.[1];
        const factor = parseFloat(factorText);
        if (toUnitId && !isNaN(factor) && factor > 0) {
          conversions.push({ toUnitId, factor });
        }
      });
    }
    
    const data = {
      name: unitData.name.trim(),
      acronym: unitData.acronym.trim().toUpperCase()
    };
    
    // Only include conversions if there are any
    if (conversions.length > 0) {
      data.conversions = conversions;
    }
    
    logger.debug('Saving measurement unit data', { unitId, data });
    
    if (unitId) {
      await nrd.measurementUnits.update(unitId, data);
      if (logger.audit) {
        logger.audit('Measurement unit updated', { unitId, data });
      } else {
        logger.info('Measurement unit updated', { unitId, data });
      }
    } else {
      const newId = await nrd.measurementUnits.create(data);
      if (logger.audit) {
        logger.audit('Measurement unit created', { unitId: newId, data });
      } else {
        logger.info('Measurement unit created', { unitId: newId, data });
      }
      logger.debug('Measurement unit created successfully', { newId, data });
    }
    
    await window.showSuccess?.('Unidad de medida guardada exitosamente');
    loadMeasurementUnits();
  } catch (error) {
    logger.error('Error saving measurement unit', error);
    throw error;
  }
}

// View measurement unit
async function viewMeasurementUnit(unitId) {
  const nrd = window.nrd;
  if (!nrd) return;
  
  try {
    const unit = await nrd.measurementUnits.getById(unitId);
    if (!unit) {
      await window.showError?.('Unidad de medida no encontrada');
      return;
    }
    
    // Show in modal or detail view
    let conversionsHTML = '<p class="text-sm text-gray-600">No hay conversiones definidas</p>';
    if (unit.conversions && unit.conversions.length > 0) {
      conversionsHTML = '<ul class="list-disc list-inside space-y-1">';
      unit.conversions.forEach(conv => {
        const targetUnit = allMeasurementUnits.find(u => u.id === conv.toUnitId);
        const targetUnitName = targetUnit ? targetUnit.name : conv.toUnitId;
        conversionsHTML += `<li class="text-sm text-gray-700">${escapeHtml(targetUnitName)}: Factor ${escapeHtml(conv.factor.toString())}</li>`;
      });
      conversionsHTML += '</ul>';
    }
    
    const message = `
      <div class="space-y-3">
        <div>
          <label class="text-xs uppercase tracking-wider text-gray-600">Nombre</label>
          <p class="text-base text-gray-900">${escapeHtml(unit.name || '')}</p>
        </div>
        <div>
          <label class="text-xs uppercase tracking-wider text-gray-600">Acrónimo</label>
          <p class="text-base text-gray-900 font-mono">${escapeHtml(unit.acronym || '-')}</p>
        </div>
        <div>
          <label class="text-xs uppercase tracking-wider text-gray-600">Conversiones</label>
          ${conversionsHTML}
        </div>
      </div>
    `;
    
    // Show detail in modal
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    
    if (modal && titleEl && messageEl) {
      titleEl.textContent = 'Detalle de Unidad de Medida';
      messageEl.innerHTML = message;
      confirmBtn.style.display = 'none';
      cancelBtn.textContent = 'Cerrar';
      modal.classList.remove('hidden');
      
      const handleClose = () => {
        modal.classList.add('hidden');
        cancelBtn.removeEventListener('click', handleClose);
      };
      cancelBtn.addEventListener('click', handleClose);
    }
  } catch (error) {
    logger.error('Error viewing measurement unit', error);
    await window.showError?.('Error al cargar la unidad de medida');
  }
}


// Delete measurement unit handler
async function deleteMeasurementUnitHandler(unitId) {
  const confirmed = await window.showConfirm?.('¿Está seguro de eliminar esta unidad de medida?');
  if (!confirmed) return;
  
  const nrd = window.nrd;
  if (!nrd) return;
  
  try {
    await nrd.measurementUnits.delete(unitId);
    if (logger.audit) {
      logger.audit('Measurement unit deleted', { unitId });
    } else {
      logger.info('Measurement unit deleted', { unitId });
    }
    await window.showSuccess?.('Unidad de medida eliminada exitosamente');
    loadMeasurementUnits();
  } catch (error) {
    logger.error('Error deleting measurement unit', error);
    await window.showError?.('Error al eliminar la unidad de medida');
  }
}


// Setup event listeners
function setupMeasurementUnitEventListeners() {
  // New unit button
  const newUnitBtn = document.getElementById('new-measurement-unit-btn');
  if (newUnitBtn) {
    newUnitBtn.addEventListener('click', () => {
      showMeasurementUnitForm();
    });
  }
}

// Populate conversion to unit select
function populateConversionToUnitSelect(excludeUnitId = null) {
  const select = document.getElementById('conversion-to-unit');
  if (!select) return;
  
  select.innerHTML = '<option value="">Seleccione...</option>';
  
  if (!allMeasurementUnits || allMeasurementUnits.length === 0) {
    return;
  }
  
  allMeasurementUnits
    .filter(unit => !excludeUnitId || unit.id !== excludeUnitId)
    .forEach(unit => {
      const option = document.createElement('option');
      option.value = unit.id;
      option.textContent = unit.name;
      select.appendChild(option);
    });
}

// Initialize measurement units view
let initializeRetryCount = 0;
const MAX_INIT_RETRIES = 10;

export function initializeMeasurementUnits() {
  logger.debug('Initializing measurement units view');
  
  // Check if service is available with retry mechanism
  const nrd = window.nrd;
  if (!nrd || !nrd.measurementUnits) {
    initializeRetryCount++;
    
    if (initializeRetryCount < MAX_INIT_RETRIES) {
      logger.warn(`MeasurementUnits service not available yet, retrying... (${initializeRetryCount}/${MAX_INIT_RETRIES})`);
      setTimeout(() => {
        initializeMeasurementUnits();
      }, 300);
      return;
    }
    
    logger.error('MeasurementUnits service not available after retries', {
      nrdAvailable: !!nrd,
      nrdKeys: nrd ? Object.keys(nrd) : [],
      measurementUnitsAvailable: nrd ? !!nrd.measurementUnits : false
    });
    const unitsList = document.getElementById('measurement-units-list');
    if (unitsList) {
      unitsList.innerHTML = '<div class="text-center py-8 sm:py-12 border border-gray-200 p-4 sm:p-8"><p class="text-red-600 mb-3 sm:mb-4 text-sm sm:text-base">Error: El servicio de unidades de medida no está disponible. Por favor, reconstruya la librería nrd-data-access o use la versión local.</p></div>';
    }
    initializeRetryCount = 0; // Reset for next attempt
    return;
  }
  
  // Reset retry count on success
  initializeRetryCount = 0;
  
  // Setup event listeners
  setupMeasurementUnitEventListeners();
  
  // Load measurement units
  loadMeasurementUnits();
  
  // Populate conversion select when units are loaded
  if (nrd.measurementUnits) {
    nrd.measurementUnits.getAll().then(units => {
      allMeasurementUnits = Array.isArray(units) ? units : (units ? Object.values(units) : []);
      populateConversionToUnitSelect();
    }).catch(err => {
      logger.warn('Failed to load measurement units for conversion select', err);
    });
  }
  
  // Also populate when showing form
  const newUnitBtn = document.getElementById('new-measurement-unit-btn');
  if (newUnitBtn) {
    newUnitBtn.addEventListener('click', () => {
      if (nrd && nrd.measurementUnits) {
        nrd.measurementUnits.getAll().then(units => {
          allMeasurementUnits = Array.isArray(units) ? units : (units ? Object.values(units) : []);
          populateConversionToUnitSelect();
        });
      }
    });
  }
}
