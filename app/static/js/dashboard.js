// KORE SUPER SIM Event Stream Dashboard JavaScript

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

    const labels = data.map(item => item.type.split('.').pop());
    const values = data.map(item => item.count);

    window.eventsTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    '#28a745',  // started - green
                    '#ff9800',  // updated - orange
                    '#dc3545'   // ended - red
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
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

// Search events
async function searchEvents() {
    const iccid = document.getElementById('search-iccid').value;
    const eventType = document.getElementById('search-event-type').value;
    const startDate = document.getElementById('search-start-date').value;
    const endDate = document.getElementById('search-end-date').value;

    // Build query string
    const params = new URLSearchParams();
    if (iccid) params.append('iccid', iccid);
    if (eventType) params.append('event_type', eventType);
    if (startDate) params.append('start_date', new Date(startDate).toISOString());
    if (endDate) params.append('end_date', new Date(endDate).toISOString());
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

    container.innerHTML = events.map(event => `
        <div class="event-card">
            <div class="event-header">
                <div class="event-time">${formatDateTime(event.event_time)}</div>
                <div class="event-type-badge ${getEventTypeBadgeClass(event.event_type)}">
                    ${event.event_type ? event.event_type.split('.').pop() : 'unknown'}
                </div>
            </div>
            <div class="event-body">
                <div class="event-row">
                    <div class="event-field">
                        <span class="field-label">SIM ICCID:</span>
                        <span class="field-value">${event.sim_iccid || 'N/A'}</span>
                    </div>
                    <div class="event-field">
                        <span class="field-label">Device Name:</span>
                        <span class="field-value">${event.sim_unique_name || 'N/A'}</span>
                    </div>
                </div>
                <div class="event-row">
                    <div class="event-field">
                        <span class="field-label">Network:</span>
                        <span class="field-value">${event.network_name || 'N/A'} (${event.network_iso_country || 'N/A'})</span>
                    </div>
                    <div class="event-field">
                        <span class="field-label">RAT:</span>
                        <span class="field-value">${event.rat_type || 'N/A'}</span>
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
                    <span class="event-id">Event ID: ${event.event_sid}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Clear search
function clearSearch() {
    document.getElementById('search-iccid').value = '';
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
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
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
// Switch Detail Tab (Structured/JSON)
function switchTab(eventId, tabName, btnElement) {
    // 1. Update Tab Buttons
    const buttonContainer = btnElement.parentElement;
    buttonContainer.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');

    // 2. Update Content Views
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
        [...data.online, ...data.offline].forEach(p => {
            L.circleMarker([p.lat, p.lon], {
                radius: 6,
                fillColor: p.status === 'online' ? '#4ade80' : '#f87171',
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            })
                .bindPopup(`
                <strong>${p.iccid}</strong><br>
                Status: ${p.status.toUpperCase()}<br>
                Time: ${new Date(p.timestamp).toLocaleString()}<br>
                Lat/Lon: ${p.lat}, ${p.lon}
             `)
                .addTo(map);
        });

    } catch (e) {
        console.error("Error loading map data", e);
    }
}

function showOnMap(lat, lon, iccid) {
    // Switch to map tab
    // We need to manually trigger the tab switch UI
    const mapTabBtn = document.querySelector('button[onclick="showView(\'map\')"]');
    if (mapTabBtn) {
        // Mock event or call showView directly
        showView('map');
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        mapTabBtn.classList.add('active');
    }

    // Wait for map init
    setTimeout(() => {
        if (!map) initMap();
        map.invalidateSize();

        // Fly to location
        map.flyTo([lat, lon], 8);

        // Add a temporary highlight marker
        const popup = L.popup()
            .setLatLng([lat, lon])
            .setContent(`<b>Selected Device</b><br>${iccid}`)
            .openOn(map);

    }, 300);
}

function resetMapView() {
    if (map) {
        map.setView([20, 0], 2);
        map.closePopup();
    }
}
