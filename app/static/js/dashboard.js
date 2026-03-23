// KORE SUPER SIM Event Stream Dashboard JavaScript

// Escape HTML special characters to prevent XSS when inserting untrusted data via innerHTML
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// View switching
function showView(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // Deactivate all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected view
    document.getElementById(viewName + '-view').classList.add('active');

    // Activate selected tab (if event triggered)
    if (event && event.target) {
        event.target.classList.add('active');
    }

    // Load analytics if analytics view is selected
    if (viewName === 'analytics') {
        loadAnalytics();
    }

    // Init map if map view is selected
    if (viewName === 'map') {
        setTimeout(initMap, 200);
    }

    // Auto-populate 30-day date range when opening Search & Filter
    if (viewName === 'search') {
        const startInput = document.getElementById('search-start-date');
        const endInput = document.getElementById('search-end-date');
        if (startInput && !startInput.value && endInput && !endInput.value) {
            const now = new Date();
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setDate(now.getDate() - 30);
            const pad = (n) => String(n).padStart(2, '0');
            startInput.value = `${thirtyDaysAgo.getUTCFullYear()}-${pad(thirtyDaysAgo.getUTCMonth()+1)}-${pad(thirtyDaysAgo.getUTCDate())}T00:00`;
            endInput.value = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}T23:59`;
        }
    }
}

// Load analytics data
async function loadAnalytics() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();

        // Update header stats
        document.getElementById('total-events').textContent = stats.total_events.toLocaleString();
        document.getElementById('unique-sims').textContent = stats.unique_sims.toLocaleString();
        document.getElementById('total-data').textContent = formatBytes(stats.total_data_usage);

        // Render charts
        renderEventsTypeChart(stats.events_by_type);
        renderTopNetworksChart(stats.top_networks);
        renderCountriesChart(stats.countries);
        renderDataUsageStats(stats.total_data_usage);
        renderRatTypeChart(stats.rat_types);
        renderTopDevicesChart(stats.top_devices);
        renderDataPerDeviceChart(stats.data_per_device);
        renderDailyTimelineChart(stats.daily_timeline);

    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

// Render Events by Type Chart
function renderEventsTypeChart(data) {
    const ctx = document.getElementById('events-by-type-chart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (window.eventsTypeChart) {
        window.eventsTypeChart.destroy();
    }

    // Normalize labels: extract last meaningful segment
    const labels = data.map(item => {
        const parts = item.type.split('.');
        let label = parts.pop();
        // Handle short-form types like "data-session-started" -> "started"
        if (label.includes('-')) {
            const sub = label.split('-');
            label = sub[sub.length - 1];
        }
        return label;
    });
    const values = data.map(item => item.count);

    // Merge duplicates after normalization
    const merged = {};
    for (let i = 0; i < labels.length; i++) {
        merged[labels[i]] = (merged[labels[i]] || 0) + values[i];
    }
    const mergedLabels = Object.keys(merged);
    const mergedValues = Object.values(merged);

    // Semantic color mapping for event types
    const colorMap = {
        'accepted': '#17a2b8',   // teal
        'rejected': '#dc3545',   // red
        'ended': '#ff9800',      // orange
        'started': '#28a745',    // green
        'updated': '#6f42c1',    // purple
    };
    const colors = mergedLabels.map(key => colorMap[key] || '#999');

    window.eventsTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: mergedLabels,
            datasets: [{
                data: mergedValues,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            onClick: (evt) => {
                const elements = window.eventsTypeChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (elements.length > 0) {
                    const label = mergedLabels[elements[0].index];
                    searchWithFilter({ event_type: label });
                }
            },
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Render Top Networks Chart
function renderTopNetworksChart(data) {
    const ctx = document.getElementById('top-networks-chart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (window.topNetworksChart) {
        window.topNetworksChart.destroy();
    }

    const labels = data.map(item => `${item.name} (${item.country})`);
    const values = data.map(item => item.count);

    window.topNetworksChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Events',
                data: values,
                backgroundColor: '#f37021',
                borderColor: '#d15a0f',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            onClick: (evt) => {
                const elements = window.topNetworksChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (elements.length > 0) {
                    const network = data[elements[0].index].name;
                    if (network) searchWithFilter({ network: network });
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Render Countries Chart
function renderCountriesChart(data) {
    const ctx = document.getElementById('countries-chart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (window.countriesChart) {
        window.countriesChart.destroy();
    }

    const labels = data.map(item => item.country);
    const values = data.map(item => item.count);

    // Generate colors
    const colors = generateColors(data.length);

    window.countriesChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            onClick: (evt) => {
                const elements = window.countriesChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const country = data[idx].country;
                    if (country) searchWithFilter({ country: country });
                }
            },
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Render Data Usage Stats
function renderDataUsageStats(totalBytes) {
    const container = document.getElementById('data-usage-stats');
    if (!container) return;

    const mb = totalBytes / (1024 * 1024);
    const gb = totalBytes / (1024 * 1024 * 1024);

    container.innerHTML = `
        <p><strong>Total Data Usage:</strong></p>
        <p style="font-size: 2em; color: #f37021; font-weight: bold;">${gb.toFixed(2)} GB</p>
        <p style="color: #666;">${mb.toFixed(2)} MB</p>
        <p style="color: #666;">${totalBytes.toLocaleString()} bytes</p>
    `;
}

// Render RAT Type Distribution Chart
function renderRatTypeChart(data) {
    const ctx = document.getElementById('rat-type-chart');
    if (!ctx || !data) return;
    if (window.ratTypeChart) window.ratTypeChart.destroy();

    const labels = data.map(item => item.type);
    const values = data.map(item => item.count);

    window.ratTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: values, backgroundColor: generateColors(data.length), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt) => {
                const elements = window.ratTypeChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (elements.length > 0) {
                    const rat = data[elements[0].index].type;
                    if (rat !== 'Unknown') searchWithFilter({ rat_type: rat });
                }
            },
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// Render Top Devices by Activity Chart
function renderTopDevicesChart(data) {
    const ctx = document.getElementById('top-devices-chart');
    if (!ctx || !data) return;
    if (window.topDevicesChart) window.topDevicesChart.destroy();

    const labels = data.map(item => item.name);
    const values = data.map(item => item.count);

    window.topDevicesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Events', data: values, backgroundColor: '#f37021', borderColor: '#d15a0f', borderWidth: 1 }]
        },
        options: {
            responsive: true, maintainAspectRatio: true, indexAxis: 'y',
            onClick: (evt) => {
                const elements = window.topDevicesChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (elements.length > 0) {
                    const name = labels[elements[0].index];
                    searchWithFilter({ device_name: name });
                }
            },
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true } }
        }
    });
}

// Render Data Usage per Device Chart
function renderDataPerDeviceChart(data) {
    const ctx = document.getElementById('data-per-device-chart');
    if (!ctx || !data) return;
    if (window.dataPerDeviceChart) window.dataPerDeviceChart.destroy();

    const labels = data.map(item => item.name);
    const values = data.map(item => item.bytes / (1024 * 1024)); // Convert to MB

    window.dataPerDeviceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Data (MB)', data: values, backgroundColor: '#17a2b8', borderColor: '#138496', borderWidth: 1 }]
        },
        options: {
            responsive: true, maintainAspectRatio: true, indexAxis: 'y',
            onClick: (evt) => {
                const elements = window.dataPerDeviceChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (elements.length > 0) {
                    const name = labels[elements[0].index];
                    searchWithFilter({ device_name: name });
                }
            },
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { callback: v => v.toFixed(1) + ' MB' } } }
        }
    });
}

// Render Daily Event Timeline Chart
function renderDailyTimelineChart(data) {
    const ctx = document.getElementById('daily-timeline-chart');
    if (!ctx || !data) return;
    if (window.dailyTimelineChart) window.dailyTimelineChart.destroy();

    const labels = data.map(item => item.date);
    const values = data.map(item => item.count);

    window.dailyTimelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Events',
                data: values,
                borderColor: '#f37021',
                backgroundColor: 'rgba(243, 112, 33, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: '#f37021'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            onClick: (evt) => {
                const elements = window.dailyTimelineChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (elements.length > 0) {
                    const date = labels[elements[0].index];
                    searchWithFilter({ start_date: date + 'T00:00', end_date: date + 'T23:59' });
                }
            },
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxTicksLimit: 15, maxRotation: 45 } },
                y: { beginAtZero: true }
            }
        }
    });
}

// Navigate to Search & Filter with pre-filled filters and auto-search
function searchWithFilter(filters) {
    // Switch to search view
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('search-view').classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('button[onclick="showView(\'search\')"]').classList.add('active');

    // Clear all fields first
    document.getElementById('search-iccid').value = '';
    document.getElementById('search-device-name').value = '';
    document.getElementById('search-event-type').value = '';
    document.getElementById('search-start-date').value = '';
    document.getElementById('search-end-date').value = '';

    // Only set date range if explicitly provided by the caller (e.g. Daily Timeline click).
    // Do NOT default to 30 days here — analytics charts show all-time data,
    // so restricting drill-downs to 30 days would hide older results.

    // Apply provided filters
    if (filters.event_type) document.getElementById('search-event-type').value = filters.event_type;
    if (filters.iccid) document.getElementById('search-iccid').value = filters.iccid;
    if (filters.start_date) document.getElementById('search-start-date').value = filters.start_date;
    if (filters.end_date) document.getElementById('search-end-date').value = filters.end_date;

    // Set device name dropdown — also pass as extra filter in case value doesn't match an option
    if (filters.device_name) {
        const deviceSelect = document.getElementById('search-device-name');
        deviceSelect.value = filters.device_name;
    }

    // Store extra filters for the search call
    window._extraFilters = {};
    if (filters.device_name) {
        const deviceSelect = document.getElementById('search-device-name');
        if (deviceSelect.value !== filters.device_name) {
            window._extraFilters.device_name = filters.device_name;
        }
    }
    if (filters.rat_type) window._extraFilters.rat_type = filters.rat_type;
    if (filters.country) window._extraFilters.country = filters.country;
    if (filters.network) window._extraFilters.network = filters.network;

    // Auto-trigger search
    searchEvents();
}

// Search events
async function searchEvents() {
    const iccid = document.getElementById('search-iccid').value;
    const deviceName = document.getElementById('search-device-name').value;
    const eventType = document.getElementById('search-event-type').value;
    const startDate = document.getElementById('search-start-date').value;
    const endDate = document.getElementById('search-end-date').value;

    // Build query string
    const params = new URLSearchParams();
    if (iccid) params.append('iccid', iccid);
    if (deviceName) params.append('device_name', deviceName);
    if (eventType) params.append('event_type', eventType);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    // Include extra filters from chart drill-downs
    if (window._extraFilters) {
        for (const [k, v] of Object.entries(window._extraFilters)) {
            params.append(k, v);
        }
        window._extraFilters = {};
    }
    params.append('limit', '100');

    try {
        const response = await fetch(`/api/events?${params.toString()}`);
        const data = await response.json();

        displaySearchResults(data.events);
    } catch (error) {
        console.error('Error searching events:', error);
        alert('Error searching events. Please try again.');
    }
}

// Display search results
function displaySearchResults(events) {
    const container = document.getElementById('search-results');

    if (events.length === 0) {
        container.innerHTML = '<div class="no-data"><p>No events found matching your criteria</p></div>';
        return;
    }

    container.innerHTML = events.map((event, idx) => {
        const coordsHtml = (event.latitude && event.longitude)
            ? `<a href="https://www.google.com/maps?q=${event.latitude},${event.longitude}" target="_blank" style="color: var(--kore-orange); text-decoration: none;">${event.latitude}, ${event.longitude} ↗</a>`
            : 'N/A';
        // Use data-* attributes so sim_iccid is never interpolated into JS code
        const mapBtn = (event.latitude && event.longitude)
            ? `<button class="tab-btn" style="color: var(--kore-orange); border-color: var(--kore-orange);" data-lat="${event.latitude}" data-lon="${event.longitude}" data-iccid="${escapeHtml(event.sim_iccid)}" onclick="showOnMap(parseFloat(this.dataset.lat), parseFloat(this.dataset.lon), this.dataset.iccid)">Map ↗</button>`
            : '';

        return `
        <div class="event-card">
            <div class="event-header" style="cursor: pointer;" onclick="toggleSearchDetail('search-detail-${idx}')">
                <div class="event-time">${formatDateTime(event.event_time)}</div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="event-type-badge ${getEventTypeBadgeClass(event.event_type)}">
                        ${event.event_type ? escapeHtml(event.event_type.split('.').pop().toUpperCase()) : 'UNKNOWN'}
                    </div>
                    <span style="font-size: 0.8em; color: #999;">▼</span>
                </div>
            </div>
            <div class="event-body">
                <div class="event-row">
                    <div class="event-field">
                        <span class="field-label">SIM ICCID:</span>
                        <span class="field-value">${escapeHtml(event.sim_iccid || 'N/A')}</span>
                    </div>
                    <div class="event-field">
                        <span class="field-label">Device Name:</span>
                        <span class="field-value">${escapeHtml(event.sim_unique_name || 'N/A')}</span>
                    </div>
                </div>
                <div class="event-row">
                    <div class="event-field">
                        <span class="field-label">Network:</span>
                        <span class="field-value">${escapeHtml(event.network_name || 'N/A')} (${escapeHtml(event.network_iso_country || 'N/A')})</span>
                    </div>
                    <div class="event-field">
                        <span class="field-label">RAT:</span>
                        <span class="field-value">${escapeHtml(event.rat_type || 'N/A')}</span>
                    </div>
                </div>
                ${event.data_total ? `
                <div class="event-row">
                    <div class="event-field">
                        <span class="field-label">Data Usage:</span>
                        <span class="field-value">
                            ↓ ${formatBytes(event.data_download)} /
                            ↑ ${formatBytes(event.data_upload)} /
                            Total: ${formatBytes(event.data_total)}
                        </span>
                    </div>
                </div>
                ` : ''}
                <div class="event-footer">
                    <span class="event-id">Event ID: ${escapeHtml(event.event_sid || '')}</span>
                </div>
            </div>

            <!-- Expandable Detail Section -->
            <div id="search-detail-${idx}" class="search-detail-expand" style="display: none; border-top: 1px solid #eee; padding: 15px;">
                <div class="detail-tabs" style="margin-bottom: 10px;">
                    <button class="tab-btn active" onclick="switchSearchDetailTab('search-detail-${idx}', 'structured', this)">Structured</button>
                    <button class="tab-btn" onclick="switchSearchDetailTab('search-detail-${idx}', 'json', this)">JSON</button>
                    ${mapBtn}
                </div>

                <div id="search-detail-${idx}-structured" class="search-detail-content">
                    <div class="event-detail-grid">
                        <div class="detail-section">
                            <h4>Identity</h4>
                            <div class="detail-row"><span class="detail-label">SIM ICCID:</span><span class="detail-value">${escapeHtml(event.sim_iccid || 'N/A')}</span></div>
                            <div class="detail-row"><span class="detail-label">Device Name:</span><span class="detail-value">${escapeHtml(event.sim_unique_name || 'N/A')}</span></div>
                            <div class="detail-row"><span class="detail-label">IMSI:</span><span class="detail-value">${escapeHtml(event.imsi || 'N/A')}</span></div>
                            <div class="detail-row"><span class="detail-label">IMEI:</span><span class="detail-value">${escapeHtml(event.imei || 'N/A')}</span></div>
                        </div>
                        <div class="detail-section">
                            <h4>Network</h4>
                            <div class="detail-row"><span class="detail-label">Operator:</span><span class="detail-value">${escapeHtml(event.network_name || 'N/A')} (${escapeHtml(event.network_iso_country || 'N/A')})</span></div>
                            <div class="detail-row"><span class="detail-label">PLMN (MCC/MNC):</span><span class="detail-value">${escapeHtml(event.network_mcc || '?')}/${escapeHtml(event.network_mnc || '?')}</span></div>
                            <div class="detail-row"><span class="detail-label">RAT:</span><span class="detail-value">${escapeHtml(event.rat_type || 'N/A')}</span></div>
                            <div class="detail-row"><span class="detail-label">APN:</span><span class="detail-value">${escapeHtml(event.apn || 'N/A')}</span></div>
                            <div class="detail-row"><span class="detail-label">IP Address:</span><span class="detail-value">${escapeHtml(event.ip_address || 'N/A')}</span></div>
                        </div>
                        <div class="detail-section">
                            <h4>Location</h4>
                            <div class="detail-row"><span class="detail-label">Coordinates:</span><span class="detail-value">${coordsHtml}</span></div>
                            <div class="detail-row"><span class="detail-label">Cell Info:</span><span class="detail-value">LAC: ${escapeHtml(event.lac || 'N/A')} / Cell: ${escapeHtml(event.cell_id || 'N/A')}</span></div>
                        </div>
                        <div class="detail-section">
                            <h4>Data Session</h4>
                            <div class="detail-row"><span class="detail-label">Total Usage:</span><span class="detail-value">${event.data_total ? (event.data_total / 1024 / 1024).toFixed(2) + ' MB' : '0 MB'}</span></div>
                            <div class="detail-row"><span class="detail-label">Download:</span><span class="detail-value">↓ ${event.data_download ? (event.data_download / 1024 / 1024).toFixed(2) + ' MB' : '0 MB'}</span></div>
                            <div class="detail-row"><span class="detail-label">Upload:</span><span class="detail-value">↑ ${event.data_upload ? (event.data_upload / 1024 / 1024).toFixed(2) + ' MB' : '0 MB'}</span></div>
                            <div class="detail-row"><span class="detail-label">Session ID:</span><span class="detail-value" style="font-size: 0.8em;">${escapeHtml(event.sim_sid || 'N/A')}</span></div>
                        </div>
                    </div>
                </div>

                <div id="search-detail-${idx}-json" class="search-detail-content" style="display: none;">
                    <div style="display: flex; justify-content: flex-end; padding: 0 0 8px;">
                        <button class="tab-btn" onclick="copySearchJson('search-json-pre-${idx}')" style="font-size: 0.8em;">Copy JSON</button>
                    </div>
                    <div class="json-view-wrapper">
                        <pre id="search-json-pre-${idx}">${escapeHtml(JSON.stringify(event, null, 2))}</pre>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Toggle expand/collapse for search result detail
function toggleSearchDetail(detailId) {
    const el = document.getElementById(detailId);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
}

// Switch between Structured and JSON tabs in search results
function switchSearchDetailTab(detailId, tabName, btnElement) {
    const container = btnElement.parentElement;
    container.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');

    const structured = document.getElementById(detailId + '-structured');
    const json = document.getElementById(detailId + '-json');

    if (tabName === 'structured') {
        if (structured) structured.style.display = 'block';
        if (json) json.style.display = 'none';
    } else if (tabName === 'json') {
        if (structured) structured.style.display = 'none';
        if (json) json.style.display = 'block';
    }
}

// Clear search
function clearSearch() {
    document.getElementById('search-iccid').value = '';
    document.getElementById('search-device-name').value = '';
    document.getElementById('search-event-type').value = '';
    document.getElementById('search-start-date').value = '';
    document.getElementById('search-end-date').value = '';

    document.getElementById('search-results').innerHTML =
        '<div class="no-data"><p>Enter search criteria and click "Search" to find events</p></div>';
}

// Utility Functions

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDateTime(isoString) {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s} UTC`;
}

function getEventTypeBadgeClass(eventType) {
    if (!eventType) return '';
    if (eventType.includes('started')) return 'started';
    if (eventType.includes('ended')) return 'ended';
    return 'updated';
}

function generateColors(count) {
    const colors = [
        '#f37021', '#28a745', '#ff9800', '#dc3545', '#6f42c1',
        '#20c997', '#fd7e14', '#e83e8c', '#17a2b8', '#ffc107'
    ];

    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    return result;
}
// Copy JSON content to clipboard
function copyJson(eventId) {
    const pre = document.getElementById('json-content-' + eventId);
    if (pre) {
        navigator.clipboard.writeText(pre.textContent).then(() => {
            const btn = event.target;
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = original; }, 1500);
        });
    }
}

// Copy JSON from search results
function copySearchJson(preId) {
    const pre = document.getElementById(preId);
    if (pre) {
        navigator.clipboard.writeText(pre.textContent).then(() => {
            const btn = event.target;
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = original; }, 1500);
        });
    }
}

// Switch Detail Tab (Structured/JSON)
function switchTab(eventId, tabName, btnElement) {
    // 1. Update Tab Buttons
    const buttonContainer = btnElement.parentElement;
    buttonContainer.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');

    // 2. Pause/resume auto-refresh based on tab
    window._autoRefreshPaused = (tabName === 'json');

    // 3. Update Content Views
    const structuredView = document.getElementById('view-structured-' + eventId);
    const jsonView = document.getElementById('view-json-' + eventId);

    if (tabName === 'structured') {
        if (structuredView) structuredView.classList.add('active');
        if (jsonView) jsonView.classList.remove('active');
    } else if (tabName === 'json') {
        if (structuredView) structuredView.classList.remove('active');
        if (jsonView) jsonView.classList.add('active');
    }
}

// --- Map Logic ---
let map = null;
let onlineLayer = null;
let offlineLayer = null;

function initMap() {
    if (map) {
        map.invalidateSize();
        return;
    }

    // Default focus
    map = L.map('map').setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    fetchHeatmapData();
}

async function fetchHeatmapData() {
    try {
        const response = await fetch('/api/heatmap');
        const data = await response.json();

        // Prepare points for heatmap
        // Intensity 0.8 looks good
        const onlinePoints = data.online.map(p => [p.lat, p.lon, 0.8]);
        const offlinePoints = data.offline.map(p => [p.lat, p.lon, 0.8]);

        // Remove existing layers
        if (onlineLayer) map.removeLayer(onlineLayer);
        if (offlineLayer) map.removeLayer(offlineLayer);

        // Add Heatmap Layers
        if (onlinePoints.length > 0) {
            onlineLayer = L.heatLayer(onlinePoints, {
                radius: 25,
                blur: 15,
                maxZoom: 10,
                gradient: { 0.4: '#4ade80', 1: '#166534' } // Green
            }).addTo(map);
        }

        if (offlinePoints.length > 0) {
            offlineLayer = L.heatLayer(offlinePoints, {
                radius: 25,
                blur: 15,
                maxZoom: 10,
                gradient: { 0.4: '#f87171', 1: '#991b1b' } // Red
            }).addTo(map);
        }

        // Add markers for individual detail access (optional but helpful)
        // Only adding if count is reasonable to avoid lag, or stick to heatmap.
        // User said "show the data in the map". Heatmap does that.
        // But for "hyperlink" to map, we need to be able to see it.

        // We'll add circles for better visibility similar to heatmap dots
        const allPoints = [...data.online, ...data.offline];
        allPoints.forEach(p => {
            L.circleMarker([p.lat, p.lon], {
                radius: 6,
                fillColor: p.status === 'online' ? '#4ade80' : '#f87171',
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            })
                .bindPopup(`
                <strong>${escapeHtml(p.iccid)}</strong><br>
                Status: ${escapeHtml(p.status.toUpperCase())}<br>
                Time: ${escapeHtml(new Date(p.timestamp).toLocaleString())}<br>
                Lat/Lon: ${p.lat}, ${p.lon}
             `)
                .addTo(map);
        });

        // Auto-zoom to fit all device locations (skip if navigating to a specific point)
        if (allPoints.length > 0) {
            window._deviceBounds = L.latLngBounds(allPoints.map(p => [p.lat, p.lon]));
            if (!window._skipAutoFit) {
                map.fitBounds(window._deviceBounds, { padding: [40, 40], maxZoom: 6 });
            }
            window._skipAutoFit = false;
        }

    } catch (e) {
        console.error("Error loading map data", e);
    }
}

function showOnMap(lat, lon, iccid) {
    // Tell fetchHeatmapData not to override our flyTo
    window._skipAutoFit = true;

    // Switch to map tab
    const mapTabBtn = document.querySelector('button[onclick="showView(\'map\')"]');
    if (mapTabBtn) {
        showView('map');
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        mapTabBtn.classList.add('active');
    }

    // Wait for map to be ready, then fly to location
    setTimeout(() => {
        if (!map) initMap();
        map.invalidateSize();
        map.flyTo([lat, lon], 10);

        L.popup()
            .setLatLng([lat, lon])
            .setContent(`<b>Selected Device</b><br>${iccid}`)
            .openOn(map);
    }, 500);
}

function resetMapView() {
    if (map) {
        map.closePopup();
        if (window._deviceBounds) {
            map.fitBounds(window._deviceBounds, { padding: [40, 40], maxZoom: 6 });
        } else {
            map.setView([20, 0], 2);
        }
    }
}

// Date picker time defaulting
// When a user picks a date in a datetime-local input, browsers may default the time to 00:00.
// For the end date, we want to default to 23:59 so the entire day is included in the search range.
// For the start date, 00:00 is already correct, so we just ensure the value is well-formed.
// If the user manually sets a specific time (not 00:00), we do NOT override it.
document.addEventListener('DOMContentLoaded', function() {
    const endDateInput = document.getElementById('search-end-date');
    if (endDateInput) {
        endDateInput.addEventListener('change', function() {
            const val = this.value;
            if (val && val.includes('T') && val.endsWith('T00:00')) {
                this.value = val.replace('T00:00', 'T23:59');
            }
        });
    }

    // Populate header stats on page load
    fetch('/api/stats')
        .then(r => r.json())
        .then(stats => {
            document.getElementById('total-events').textContent = stats.total_events.toLocaleString();
            document.getElementById('unique-sims').textContent = stats.unique_sims.toLocaleString();
            document.getElementById('total-data').textContent = formatBytes(stats.total_data_usage);
        })
        .catch(err => console.error('Error loading header stats:', err));

    // Populate device name dropdown
    const deviceSelect = document.getElementById('search-device-name');
    if (deviceSelect) {
        fetch('/api/devices')
            .then(r => r.json())
            .then(devices => {
                devices.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    deviceSelect.appendChild(opt);
                });
            })
            .catch(err => console.error('Error loading devices:', err));
    }
});
