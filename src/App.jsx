import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

// --- Leaflet & Routing ---
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// --- Drag and Drop Engine ---
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

// --- Icons (Consolidated lucide-react) ---
import {
  Camera,
  CheckCircle,
  Circle,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  Compass,
  FileText,
  FileX,
  Heart,
  HelpCircle,
  Home,
  Image,
  Landmark,
  LayoutGrid,
  Mail,
  MapPin,
  MapPinned,
  MessageSquare,
  Mountain,
  Navigation,
  Navigation2,
  Plus,
  PlusCircle,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Sun,
  Trash2,
  Video,
  Waves,
  Wind,
  X
} from 'lucide-react';


// --- Initialization ---

const CONFIG = {
  SUPABASE: {
    // Vite automatically picks these up from .env.local (local) or Vercel (production)
    URL: import.meta.env.VITE_SUPABASE_URL,
    KEY: import.meta.env.VITE_SUPABASE_KEY,
  },
  API_KEYS: {
    ARTICLE: import.meta.env.VITE_ARTICLE_KEY,
    WEATHER: import.meta.env.VITE_WEATHER_KEY,

  }
};

// Destructure for the rest of your app
const { URL: SUPABASE_URL, KEY: SUPABASE_KEY } = CONFIG.SUPABASE;
const { ARTICLE: ARTICLE_KEY, WEATHER: WEATHER_KEY } = CONFIG.API_KEYS;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);



// --- Leaflet Marker Fix ---
if (typeof window !== 'undefined') {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

const HomePoint = { lat: 7.0911, lng: 79.9161 };
const VALID_CATEGORIES = [
  "Waterfall", "Mountain", "Trail", "Viewpoint", "Beach", "Park",
  "Plateaus", "Reserved Forest", "Monastery", "Archaeology",
  "Reservoir", "Pool", "Stream", "Location"
];

// --- Helper Components ---

/**
 * Optimized Icon Wrapper using native Lucide-React components.
 * This replaces the manual DOM injection for better React stability.[cite: 1]
 */

const InstagramIcon = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const ThreadsIcon = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.33 14.15c-.63.54-1.43.81-2.34.81-1.23 0-2.23-.49-2.9-1.41-.54-.74-.81-1.74-.81-2.99 0-1.26.28-2.27.82-3 .67-.91 1.67-1.37 2.89-1.37 1.26 0 2.23.47 2.88 1.4.53.75.79 1.76.79 3.01v.83c0 .55-.15.96-.43 1.23-.28.27-.68.41-1.16.41-.44 0-.81-.14-1.08-.41-.27-.28-.41-.67-.41-1.19v-3.79H10v3.92c0 .88.26 1.57.77 2.07.51.5 1.22.75 2.11.75.81 0 1.49-.24 2.04-.7v.61h1.67v-4.89c0-1.65-.4-2.96-1.18-3.92-.91-1.12-2.24-1.69-3.94-1.69-1.72 0-3.05.56-3.94 1.67-.79.98-1.19 2.31-1.19 3.95 0 1.62.4 2.95 1.19 3.93.9.12 2.23.69 3.94.69.88 0 1.67-.16 2.36-.47v-1.72z" />
  </svg>
);

const TwitterIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);

/**
 * Optimized Icon Wrapper.
 * Maps Lucide components and local SVGs to a consistent internal naming system.
 */
const Icon = React.memo(({ name, className = "w-4 h-4" }) => {
  const icons = {
    'camera': Camera,
    'check-circle': CheckCircle,
    'circle': Circle,
    'cloud': Cloud,
    'cloud-drizzle': CloudDrizzle,
    'cloud-fog': CloudFog,
    'cloud-lightning': CloudLightning,
    'cloud-rain': CloudRain,
    'file-text': FileText,
    'file-x': FileX,
    'heart': Heart,
    'home': Home,
    'image': Image,
    'instagram': InstagramIcon,
    'landmark': Landmark,
    'layout-grid': LayoutGrid,
    'mail': Mail,
    'map-pin': MapPin,
    'message-square': MessageSquare,
    'navigation': Navigation,
    'navigation-2': Navigation2,
    'plus-circle': PlusCircle,
    'refresh-cw': RefreshCw,
    'shield': Shield,
    'shield-alert': ShieldAlert,
    'shield-check': ShieldCheck,
    'snowflake': Snowflake,
    'sparkles': Sparkles,
    'sun': Sun,
    'threads': ThreadsIcon,
    'trash-2': Trash2,
    'twitter': TwitterIcon,
    'video': Video,
    'wind': Wind,
    'x': X,
  };

  const DynamicIcon = icons[name] || HelpCircle;

  // Render logic to handle local SVG components and Lucide components identically
  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
      <DynamicIcon className="w-full h-full" strokeWidth={1.75} />
    </span>
  );
});
/**
 * Dynamic Weather Icon Component mapping API conditions to Lucide icons.
 * Note: Uses direct Lucide components for color flexibility in route cards.
 */
const WeatherIcon = ({ condition }) => {
  const weatherMap = {
    'Clear': { Icon: Sun, color: 'text-amber-500' },
    'Clouds': { Icon: Cloud, color: 'text-slate-400' },
    'Rain': { Icon: CloudRain, color: 'text-blue-500' },
    'Drizzle': { Icon: CloudDrizzle, color: 'text-cyan-500' },
    'Thunderstorm': { Icon: CloudLightning, color: 'text-yellow-500' },
    'Snow': { Icon: Snowflake, color: 'text-sky-300' },
    'Mist': { Icon: CloudFog, color: 'text-slate-300' },
    'Smoke': { Icon: CloudFog, color: 'text-slate-300' },
    'Haze': { Icon: CloudFog, color: 'text-slate-300' },
    'Dust': { Icon: Wind, color: 'text-orange-300' },
    'Fog': { Icon: CloudFog, color: 'text-slate-300' },
  };

  const { Icon: WIcon, color } = weatherMap[condition] || weatherMap['Clear'];
  return <WIcon className={`w-5 h-5 ${color} shrink-0`} strokeWidth={1.75} />;
};

/**
 * Generates a clean, URL-safe slug from any string.
 * Converts to lowercase, removes special characters, and replaces spaces with hyphens.
 */
export const generateCleanSlug = (text) => {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .trim()
    .normalize('NFD')                   // Decompose accented characters (e.g., "é" -> "e" + "´")
    .replace(/[\u0300-\u036f]/g, '')    // Strip diacritic mark overlays
    .replace(/[–—]/g, '-')              // Convert En-dash & Em-dash to standard hyphens
    .replace(/[^a-z0-9\s-]/g, '')       // Remove non-alphanumeric characters except spaces & hyphens
    .replace(/\s+/g, '-')               // Replace spaces with hyphens
    .replace(/-+/g, '-');               // Collapse multiple hyphens into a single hyphen
};


const formatPageName = (path) => {
  if (!path || path === '/') return 'Main Page';

  const cleanSlug = (slug) =>
    slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

  if (path.includes(' ') || path === 'Plan Function' || path === 'Add Function' || path === 'Main Page') {
    return path;
  }

  if (path.startsWith('/gallery/')) {
    const slug = path.split('/').pop();
    return `Gallery - ${cleanSlug(slug)}`;
  }

  if (path.startsWith('/place/')) {
    const slug = path.split('/').pop();
    return `Article - ${cleanSlug(slug)}`;
  }

  if (path.includes('-')) {
    return cleanSlug(path);
  }

  return path;
};


const MetricColumn = ({ title, data, highlightValue }) => (
  <div className="min-w-0">
    <p className="text-[9px] font-black uppercase text-slate-500 mb-3 border-b border-slate-700 pb-1 tracking-wider">
      {title}
    </p>
    <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
      {(data || [])
        .filter(([_, count]) => count > 0)
        .map(([name, count]) => {
          const isLatest = highlightValue && name === highlightValue;

          return (
            <div key={name} className="flex justify-between text-[10px] font-bold group">
              <span className={`truncate pr-2 transition-colors ${isLatest ? 'text-orange-500' : 'text-slate-400 group-hover:text-white'
                }`}>
                {/* Now formatPageName is perfectly in scope! */}
                {formatPageName(name)}
              </span>
              <span className={`font-black ${isLatest ? 'text-orange-500' : 'text-white'}`}>
                {count}
              </span>
            </div>
          );
        })}
    </div>
  </div>
);


// --- Main Application Component ---
function App() {
  // --- Constants ---
  const PLATFORM_COLUMNS = {
    instagram: 'published_instagram_at',
    threads: 'published_threads_at',
    mastodon: 'published_masto_at',
    bluesky: 'published_bsky_at',
    pinterest: 'published_pinterest_at',
    flipboard: 'published_flipboard_at',
    twitter: 'published_twitter_at',
    unplash: 'published_unplash_at'
  };

  // --- Auth & Token States ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [igToken, setIgToken] = useState("");
  const [threadsToken, setThreadsToken] = useState("");

  // --- Core Data States ---
  const [places, setPlaces] = useState([]);
  const [visiblePlaces, setVisiblePlaces] = useState([]);
  const [filteredPlaces, setFilteredPlaces] = useState([]);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [allComments, setAllComments] = useState([]);
  const [likesData, setLikesData] = useState([]);
  const [subscribersData, setSubscribersData] = useState([]);
  const [expandedLikeLoc, setExpandedLikeLoc] = useState(null);
  const [weatherData, setWeatherData] = useState({});

  // --- UI, Search & Filter States ---
  const [activeTab, setActiveTab] = useState('places');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [toast, setToast] = useState({ show: false, msg: '' });

  // --- Active Trip & Route Planning States ---
  const [selectedTrip, setSelectedTrip] = useState([]);
  const [activeRouteName, setActiveRouteName] = useState('');
  const [routeWeather, setRouteWeather] = useState(null);

  // --- Location & Add Location Flow States ---
  const [manualHome, setManualHome] = useState(null);
  const [userCoords, setUserCoords] = useState(null);
  const [sortCenter, setSortCenter] = useState(HomePoint);
  const [locationSource, setLocationSource] = useState('device');
  const [activePinHubId, setActivePinHubId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [stagedLocation, setStagedLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [albumLinks, setAlbumLinks] = useState([]);

  // --- DOM & Mutable Instance Refs ---
  const mapRef = useRef(null);
  const lastRoutePoints = useRef("");
  const markersLayer = useRef(L.layerGroup());
  const routingControl = useRef(null);
  const autocompleteRef = useRef(null);
  const lastDrawnCoords = useRef(null);
  const knownUsersRef = useRef(new Set());
  const downloadedImagesRef = useRef(new Set());
  const activeSharesRef = useRef(new Set());
  const REFRESH_INTERVAL_SECONDS = 600;
  const [timeLeft, setTimeLeft] = useState(REFRESH_INTERVAL_SECONDS);

  useEffect(() => {
    if (isLoggedIn) {
      /**
       * Prioritize Vercel/Vite environment variable (VITE_ARTICLE_KEY).
       * Fallback to LocalStorage if the environment variable is not set.
       */
      const key = import.meta.env.VITE_ARTICLE_KEY || localStorage.getItem('ARTICLE_KEY');

      if (key) {
        // Assigning to window for global access as required by your app logic
        window.ARTICLE_KEY = key;
      } else {
        triggerToast("No API key provided. AI features will be limited.");
      }
    }
  }, [isLoggedIn]);


  // --- 1. GPS & DATA INITIALIZATION ---

  // Update Reference Point whenever GPS or Toggle changes
  useEffect(() => {
    if (locationSource === 'device' && userCoords) {
      setSortCenter(userCoords);
    } else {
      setSortCenter(HomePoint);
    }
  }, [userCoords, locationSource]);

  // Update the Geolocation effect to just store coordinates
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, (err) => {
        triggerToast("GPS Access Denied, falling back to HomePoint");
        setLocationSource('home'); // Auto-fallback
      });
    } else {
      setLocationSource('home');
    }
  }, []);

  React.useEffect(() => {
    refreshAllData();
    initGoogle();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          refreshAllData(); // Trigger full database sync
          return REFRESH_INTERVAL_SECONDS; // Reset timer
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Optional Helper: Reset countdown when manual refresh occurs
  const handleManualRefresh = () => {
    refreshAllData();
    setTimeLeft(REFRESH_INTERVAL_SECONDS);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ============================================================================
  // --- WEATHER, ROUTING & MAP MARKER MANAGERS ---
  // ============================================================================

  // --- 1. WEATHER FETCHING ---
  // Fetches weather forecasts for waypoints missing existing weather data.
  const fetchRouteWeather = React.useCallback(async (waypoints) => {
    const fetchList = waypoints.filter(wp => wp.place_name && !weatherData[wp.place_name]);
    if (fetchList.length === 0) return;

    try {
      const weatherPromises = fetchList.map(async (wp) => {
        const lat = wp.latitude !== undefined ? wp.latitude : wp.lt;
        const lng = wp.longitude !== undefined ? wp.longitude : wp.ln;
        if (!lat || !lng) return null;

        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${WEATHER_KEY}`
        );
        const data = await response.json();

        if (data.list && data.list.length >= 9) {
          return {
            name: wp.place_name,
            data: {
              current: Math.round(data.list[0].main.temp),
              currentCond: data.list[0].weather[0].main,
              nextDay: Math.round(data.list[8].main.temp),
              nextCond: data.list[8].weather[0].main
            }
          };
        }
        return null;
      });

      const results = await Promise.all(weatherPromises);
      const newBatch = {};
      results.forEach(res => { if (res) newBatch[res.name] = res.data; });

      if (Object.keys(newBatch).length > 0) {
        setWeatherData(prev => ({ ...prev, ...newBatch }));
      }
    } catch (error) {
      console.error("Error fetching route weather:", error);
    }
  }, [weatherData]);


  // --- 2. ACTIVE TRIP & WEATHER SYNC EFFECT ---
  // Automatically resets active route metadata when trip is cleared and triggers weather fetches.
  React.useEffect(() => {
    if (selectedTrip.length === 0) {
      setActiveRouteName('');
      if (setRouteWeather) setRouteWeather(null);
      return;
    }

    if (activeTab === 'map') {
      fetchRouteWeather(selectedTrip);
    }
  }, [selectedTrip, activeTab, fetchRouteWeather]);


  // --- 3. STEADY OSRM ROUTING EFFECT ---
  // Draws directional routing polyline lines between origin and selected waypoints.
  React.useEffect(() => {
    // Cleanup routing control when leaving map tab or when map is unready
    if (activeTab !== 'map' || !mapReady) {
      if (routingControl.current && mapRef.current) {
        try {
          if (mapRef.current.hasLayer(routingControl.current)) {
            mapRef.current.removeControl(routingControl.current);
          }
        } catch (e) {
          console.warn("Routing control cleanup error ignored:", e);
        }
        routingControl.current = null;
      }
      return;
    }

    if (!mapRef.current) return;

    const startPoint = L.latLng(HomePoint.lat, HomePoint.lng);
    const waypoints = [
      startPoint,
      ...selectedTrip.map(p => {
        const lat = p.latitude !== undefined ? p.latitude : p.lt;
        const lng = p.longitude !== undefined ? p.longitude : p.ln;
        return L.latLng(parseFloat(lat), parseFloat(lng));
      })
    ];

    // Debounce routing calculations (600ms) to prevent OSRM API rate-limiting
    const routingTimeout = setTimeout(() => {
      try {
        if (routingControl.current) {
          if (routingControl.current._map) {
            routingControl.current.setWaypoints(waypoints);
          } else {
            routingControl.current.addTo(mapRef.current);
            routingControl.current.setWaypoints(waypoints);
          }
        } else if (waypoints.length >= 2) {
          routingControl.current = L.Routing.control({
            waypoints: waypoints,
            lineOptions: {
              styles: [{ color: '#ef4444', weight: 5, opacity: 0.8 }]
            },
            router: L.Routing.osrmv1({
              serviceUrl: 'https://router.project-osrm.org/route/v1'
            }),
            createMarker: () => null,
            addWaypoints: false,
            show: false
          }).addTo(mapRef.current);
        }
      } catch (err) {
        console.error("Routing calculation failed:", err);
      }
    }, 600);

    return () => {
      clearTimeout(routingTimeout);
      if (routingControl.current && mapRef.current && activeTab !== 'map') {
        try {
          mapRef.current.removeControl(routingControl.current);
        } catch (e) { }
        routingControl.current = null;
      }
    };
  }, [selectedTrip, activeTab, mapReady]);


  // --- 4. DRAG & DROP REORDERING HANDLERS ---

  // Reorders active trip waypoints locally
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(selectedTrip);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setSelectedTrip(items);
  };

  // Reorders saved routes locally and persists new sort_order to Supabase
  const handleSavedRoutesDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(savedRoutes);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setSavedRoutes(items);

    try {
      const updatePromises = items.map((route, index) =>
        supabaseClient
          .from('saved_travel_routes')
          .update({ sort_order: index })
          .eq('id', route.id)
      );

      await Promise.all(updatePromises);
    } catch (err) {
      console.error("Error saving route order:", err);
      triggerToast("Failed to save the new route order.");
      refreshAllData();
    }
  };


  // --- 5. MARKER MANAGER EFFECT ---
  // Synchronizes dot markers, dynamic reservation statuses, tooltips, and popups.
  React.useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    let resizeTimer;
    if (activeTab === 'map') {
      resizeTimer = setTimeout(() => {
        mapRef.current.invalidateSize();
      }, 100);
    }

    markersLayer.current.clearLayers();

    // Helper: Renders customizable Leaflet circle markers
    const addDot = (lat, lng, color, title, subtitle, routePlanName = null) => {
      const pLat = parseFloat(lat);
      const pLng = parseFloat(lng);
      if (isNaN(pLat) || isNaN(pLng)) return;

      const marker = L.circleMarker([pLat, pLng], {
        radius: 7,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      });

      const tooltipContent = routePlanName ? `${title} (Plan: ${routePlanName})` : title;
      marker.bindTooltip(tooltipContent, {
        direction: 'top',
        sticky: true,
        className: 'custom-map-tooltip',
        offset: [0, -5]
      });

      marker.bindPopup(`
      <div style="padding: 4px; font-family: sans-serif; min-width: 120px;">
        <b style="font-size: 11px; color: ${color}; text-transform: uppercase;">${title}</b><br/>
        <span style="font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase;">${subtitle}</span>
        ${routePlanName ? `
          <div style="margin-top: 4px; border-top: 1px dashed #e2e8f0; padding-top: 4px;">
            <span style="font-size: 9px; color: #a855f7; font-weight: 900; text-transform: uppercase; tracking-tight: 0.05em; display: inline-block; background: #f3e8ff; padding: 1px 4px; border-radius: 3px;">★ Reserved</span>
            <div style="font-size: 9px; color: #7c3aed; font-weight: bold; font-style: italic; margin-top: 1px;">Plan: ${routePlanName}</div>
          </div>
        ` : ''}
      </div>
    `);

      marker.addTo(markersLayer.current);
    };

    // Render Places (Filtered / Search list)
    const displayList = searchTerm ? filteredPlaces : places;
    displayList.forEach(p => {
      const matchingRoute = savedRoutes.find(route => {
        let wpArray = [];
        try {
          wpArray = typeof route.waypoints === 'string' ? JSON.parse(route.waypoints) : (route.waypoints || []);
        } catch (e) {
          wpArray = [];
        }
        return wpArray.some(wp => wp.n === p.place_name || wp.place_name === p.place_name || wp.id === p.id);
      });

      const reservedRouteName = matchingRoute ? matchingRoute.route_name : null;
      const isReserved = !!reservedRouteName;
      const color = isReserved ? '#a855f7' : (p.status === 'done' ? '#22c55e' : '#f97316');

      addDot(
        p.latitude,
        p.longitude,
        color,
        p.place_name || 'Location',
        p.category || 'Point of Interest',
        reservedRouteName
      );
    });

    // Render Saved Route Waypoints directly
    savedRoutes.forEach(route => {
      try {
        const pts = typeof route.waypoints === 'string' ? JSON.parse(route.waypoints) : route.waypoints;
        pts?.forEach(pt => {
          const lat = pt.latitude !== undefined ? pt.latitude : pt.lt;
          const lng = pt.longitude !== undefined ? pt.longitude : pt.ln;
          addDot(lat, lng, '#a855f7', pt.place_name || pt.n || 'Route Stop', 'Saved Route Plan', route.route_name);
        });
      } catch (e) {
        // Fallback for JSON parsing errors
      }
    });

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
    };

  }, [mapReady, activeTab, filteredPlaces, places, savedRoutes, searchTerm]);

  // --- 4. SEARCH & FILTER LOGIC ---

  React.useEffect(() => {
    // 1. Reset to full list if search is empty
    if (!searchTerm.trim()) {
      setFilteredPlaces(places);
      return;
    }

    const lowSearch = searchTerm.toLowerCase();

    const filtered = places.filter(p => {
      // 2. Extract values with fallbacks to empty strings
      const name = String(p?.place_name || "").toLowerCase();
      const cat = String(p?.category || "").toLowerCase();
      const locality = String(p?.locality || "").toLowerCase();

      // 3. Consistently check all relevant fields
      return (
        name.includes(lowSearch) ||
        cat.includes(lowSearch) ||
        locality.includes(lowSearch)
      );
    });

    setFilteredPlaces(filtered);
  }, [searchTerm, places]);


  useEffect(() => {

    if (activeTab === 'map' && filteredPlaces.length > 0 && searchTerm.length > 2 && mapRef.current) {
      const firstMatch = filteredPlaces[0];

      const lat = parseFloat(firstMatch.latitude);
      const lng = parseFloat(firstMatch.longitude);

      if (!isNaN(lat) && !isNaN(lng)) {

        const mapContainer = mapRef.current.getContainer();
        if (mapContainer && mapContainer.clientWidth > 0) {
          mapRef.current.flyTo([lat, lng], 12, {
            animate: true,
            duration: 1.5
          });
        }
      }
    }
  }, [filteredPlaces, searchTerm, activeTab]);


  // Social Media Sharing

  const socialLocations = useMemo(() =>
    places.filter(p => p.status === 'done'),
    [places]
  );

  const getAiMetadata = (p) => {
    // Assuming p.ai_article contains the AI generated content
    // We can fallback to defaults if the AI hasn't run yet
    const content = p.ai_article || "";
    const titleMatch = content.match(/# (.*)/); // Try to find a markdown H1
    const artisticTitle = titleMatch ? titleMatch[1] : `✨ Discover ${p.place_name}`;

    // Clean description (remove hashtags and titles for the base text)
    const description = content
      .replace(/# .*/g, '')
      .replace(/#\w+/g, '')
      .substring(0, 200) + "...";

    return { artisticTitle, description };
  };

  // --- Social Sharing Logic ---

  // ==========================================
  // 0. POST SHARE VALIDATOR
  // ==========================================

  const checkAndPost = async (p, platform, shareAction) => {
    if (!p) return;

    const shareKey = `${p.id}-${platform}`;

    // 1. Guard against concurrent clicks during the 8-second API wait window
    if (activeSharesRef.current.has(shareKey)) {
      setToast?.({ show: true, msg: `Publishing to ${platform} in progress, please wait...` });
      return;
    }

    // 2. Lock the operation
    activeSharesRef.current.add(shareKey);

    try {
      // Trigger the background download using the proxy
      if (p.cover_photo_url) {
        downloadCoverImage(p.cover_photo_url, p.place_name);
      }

      const targetColumn = PLATFORM_COLUMNS[platform];

      const { data } = await supabaseClient
        .from('travel_bucket_list')
        .select(targetColumn)
        .eq('id', p.id)
        .single();

      if (data?.[targetColumn]) {
        const name = platform.charAt(0).toUpperCase() + platform.slice(1);
        setToast?.({ show: true, msg: `Already shared to ${name}!` });
        setTimeout(() => { setToast?.({ show: false, msg: "" }); }, 3000);
        return;
      }

      await shareAction();

    } finally {
      // 3. Release the lock regardless of a success or error
      activeSharesRef.current.delete(shareKey);
    }
  };

  // ==========================================
  // IMAGE DOWNLOADER (WITH WEBP/JPEG DETECTION)
  // ==========================================
  const downloadCoverImage = async (imageUrl, locationName) => {
    if (!imageUrl) return;

    // --- FIX: Check if this location's cover image was already downloaded ---
    if (downloadedImagesRef.current.has(locationName)) {
      console.log(`Cover image for ${locationName} already downloaded in this session. Skipping duplicate.`);
      return;
    }

    try {
      const proxyUrl = `/api/cover-image-proxy?url=${encodeURIComponent(imageUrl)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to download image");
      }

      const blob = await response.blob();

      if (blob.size < 1000) {
        throw new Error("File too small; the image source appears to be empty or corrupted.");
      }

      // Force read the exact Content-Type from the proxy response
      const mimeType = response.headers.get('content-type') || blob.type || '';

      // --- DEBUGGING LOGS --- 
      console.log("DEBUG - Downloaded File Size:", blob.size, "bytes");
      console.log("DEBUG - Detected MIME Type:", mimeType);
      // ----------------------

      let ext = 'jpg';
      if (mimeType.includes('avif')) ext = 'avif';
      else if (mimeType.includes('webp')) ext = 'webp';
      else if (mimeType.includes('png')) ext = 'png';
      else if (mimeType.includes('gif')) ext = 'gif';
      else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
      else ext = 'bin'; // If it saves as .bin, the payload is not a valid image format

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;

      link.download = `${locationName.replace(/[^a-z0-9]/gi, '_')}.${ext}`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      // --- FIX: Record the successful download to prevent duplicates ---
      downloadedImagesRef.current.add(locationName);

    } catch (err) {
      console.error("Download Error:", err.message);
      if (typeof triggerToast === 'function') {
        triggerToast(`Error: ${err.message}`);
      } else {
        alert(`Error: ${err.message}`);
      }
    }
  };

  const updateSupabasePostStatus = async (id, platform) => {
    const targetColumn = PLATFORM_COLUMNS[platform];
    const currentTimestamp = new Date().toISOString();

    // 1. Update the persistent remote backend database
    await supabaseClient
      .from('travel_bucket_list')
      .update({ [targetColumn]: currentTimestamp })
      .eq('id', id);

    // 2. IMMEDIATELY mutate local React states to trigger instant visual updates
    const stateUpdateHandler = (prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, [targetColumn]: currentTimestamp } : item
      );

    setPlaces(stateUpdateHandler);
    setFilteredPlaces(stateUpdateHandler);
  };


  // ==========================================
  // 1. CENTRALIZED TAG GENERATOR & URL HELPER
  // ==========================================
  const getSpecificTags = (place) => {
    const tags = new Set();
    const cat = (place.category || "").toLowerCase();
    const story = (place.ai_article?.story || place.ai_article?.description || "").toLowerCase();

    // Check Scenery & Category
    if (cat === "waterfall") tags.add("#WaterfallHunting").add("#NaturePhotography");
    if (cat === "mountain" || cat === "trail" || cat === "viewpoint") tags.add("#LandscapePhotography").add("#Adventure");
    if (cat === "beach") tags.add("#Beach").add("#Coastal");
    if (cat === "reserved forest" || cat === "park") tags.add("#NatureSeekers").add("#Wildlife");

    // Check Content, Gear, & Vibe
    if (story.includes("drone") || story.includes("aerial")) tags.add("#DronePhotography").add("#AerialPhotography");
    if (story.includes("iphone") || story.includes("mobile")) tags.add("#ShotOniPhone").add("#MobilePhotography");
    if (story.includes("ride") || story.includes("road trip") || story.includes("motorcycle")) tags.add("#RoadTrip").add("#MotorcycleDiaries");
    if (story.includes("camp") || story.includes("tent") || story.includes("trek")) tags.add("#Camping").add("#Outdoors");

    // Safety fallback if no specific tags were triggered
    if (tags.size === 0) {
      tags.add("#LandscapePhotography").add("#Explore");
    }

    return Array.from(tags).join(" ");
  };



  /**
   * Generates clean URL path structures: https://www.myjournalview.com/gallery/Devon-Falls
   */
  const generateGalleryLink = (locationName, utmSource = '') => {
    const formattedName = generateCleanSlug(locationName);
    // Updated to use the clean sub-directory route layout
    let url = `https://www.myjournalview.com/gallery/${formattedName}`;

    if (utmSource) {
      // Changed from '&' to '?' because it is now the first parameter in the path URL
      url += `?utm_source=${utmSource}`;
    }
    return url;
  };

  // ==========================================
  // 2. REVISED INTEGRATION SHARING FUNCTIONS
  // ==========================================

  /**
   * Helper Function: Generate Gallery URL
   * Converts a location name into a URL-friendly slug and returns the gallery link.
   */
  const slug = generateCleanSlug(name);

  // --- META (FACEBOOK/INSTAGRAM/THREADS) ---
  const handleMetaShare = async (p, platform, accessToken) => {
    // Defensive Guard: Strictly prevent React Event objects from reaching the backend
    if (accessToken && typeof accessToken !== 'string') {
      console.error(`Blocked invalid token payload for ${platform}. Expected string, got:`, typeof accessToken);
      setToast?.({ show: true, msg: "System Error: Invalid token format detected." });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 4000);
      return;
    }

    console.log(`[DEBUG] Platform: ${platform}`);
    console.log(`[DEBUG] Token Value:`, accessToken);
    console.log(`[DEBUG] Token Length:`, accessToken ? accessToken.length : 'N/A');

    const locationName = p.place_name || "Island Vignette";
    const shareLink = generateGalleryLink(locationName);
    const coreTags = "#MyJournal #SriLanka #TravelSriLanka #TravelPhotography";
    const dynamicHashtags = `${coreTags} ${getSpecificTags(p)}`.trim();

    const storyText = p.ai_article?.story || p.ai_article?.description || "";
    const cleanText = storyText.replace(/[#*]/g, '').trim();

    const platformLimit = platform === 'threads' ? 500 : 2200;
    const fixedCost = locationName.length + shareLink.length + dynamicHashtags.length + 40;
    const maxDescBudget = Math.max(0, platformLimit - fixedCost - 5);

    let shortDesc = cleanText;
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    let tempDesc = "";

    for (let sentence of sentences) {
      const candidate = (tempDesc + " " + sentence.trim()).trim();
      if (candidate.length <= maxDescBudget) tempDesc = candidate;
      else break;
    }

    if (!tempDesc && cleanText) {
      tempDesc = cleanText.substring(0, maxDescBudget).trim();
      const lastSpace = tempDesc.lastIndexOf(" ");
      if (lastSpace > 0) tempDesc = tempDesc.substring(0, lastSpace);
      tempDesc += "...";
    }
    shortDesc = tempDesc;

    const socialText = `📍 ${locationName}\n\n${shortDesc}\n\n🔗 Explore more entries:\n${shareLink}\n\n${dynamicHashtags}`;
    const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    setToast?.({ show: true, msg: `Publishing to ${platformName}...` });

    try {
      const response = await fetch('/api/share-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          text: socialText,
          imageUrl: p.cover_photo_url,
          link: shareLink,
          ...(platform === 'threads' ? { threadsAccessToken: accessToken } : { igAccessToken: accessToken })
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Failed to post to ${platform}`);
      }

      await updateSupabasePostStatus(p.id, platform);
      setToast?.({ show: true, msg: `Live on ${platformName}!` });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);

    } catch (err) {
      console.error(`${platform} Integration Error:`, err);
      setToast?.({ show: true, msg: err.message || "Unknown error occurred." });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 6000);
    }
  };

  // --- MASTODON ---
  const handleMastodonShare = async (p) => {
    const locationName = p.place_name || "Island Vignette";
    const shareLink = generateGalleryLink(locationName);
    const coreTags = "#MyJournal #SriLanka #TravelSriLanka #TravelPhotography";
    const dynamicHashtags = `${coreTags} ${getSpecificTags(p)}`.trim();

    const storyText = p.ai_article?.story || p.ai_article?.description || "";
    const cleanText = storyText.replace(/[#*]/g, '').trim();

    const fixedCost = locationName.length + 4 + 7 + shareLink.length + 4 + dynamicHashtags.length;
    const maxDescBudget = 500 - fixedCost - 5;

    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    let shortDesc = "";

    for (let sentence of sentences) {
      const candidate = (shortDesc + " " + sentence.trim()).trim();
      if (candidate.length <= maxDescBudget) shortDesc = candidate;
      else break;
    }

    if (!shortDesc && cleanText) {
      shortDesc = cleanText.substring(0, maxDescBudget).trim();
      const lastSpace = shortDesc.lastIndexOf(" ");
      if (lastSpace > 0) shortDesc = shortDesc.substring(0, lastSpace);
      shortDesc += "...";
    }

    const tootText = `${locationName}\n\n${shortDesc}\n\n 📍Location: ${shareLink}\n\n${dynamicHashtags}`;
    setToast?.({ show: true, msg: "Publishing to Mastodon..." });

    try {
      const response = await fetch('/api/share-mastodon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tootText, coverImageUrl: p.cover_photo_url, locationName }),
      });

      if (!response.ok) throw new Error("Failed to post to Mastodon");

      await updateSupabasePostStatus(p.id, 'mastodon');
      setToast?.({ show: true, msg: "Shared to Mastodon!" });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
    } catch (err) {
      console.error("Mastodon Error:", err);
      setToast?.({ show: true, msg: "Mastodon Error" });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
    }
  };

  // --- BLUESKY ---
  const handleBlueskyShare = async (p) => {
    const locationName = p.place_name || "Island Vignette";
    const shareLink = generateGalleryLink(locationName);
    const coreTags = "#MyJournal #SriLanka";
    const specificTags = getSpecificTags(p).split(' ').slice(0, 2).join(' ');
    const dynamicHashtags = `${coreTags} ${specificTags}`.trim();

    const storyText = p.ai_article?.story || p.ai_article?.description || "";
    const cleanText = storyText.replace(/[#*]/g, '').trim();

    const fixedCost = locationName.length + 4 + 7 + shareLink.length + 4 + dynamicHashtags.length;
    const maxDescBudget = 300 - fixedCost - 5;

    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    let shortDesc = "";

    for (let sentence of sentences) {
      const candidate = (shortDesc + " " + sentence.trim()).trim();
      if (candidate.length <= maxDescBudget) shortDesc = candidate;
      else break;
    }

    if (!shortDesc && cleanText) {
      shortDesc = cleanText.substring(0, maxDescBudget).trim();
      const lastSpace = shortDesc.lastIndexOf(" ");
      if (lastSpace > 0) shortDesc = shortDesc.substring(0, lastSpace);
      shortDesc += "...";
    }

    const bskyText = `${locationName}\n\n${shortDesc}\n\n 📍Location: ${shareLink}\n\n${dynamicHashtags}`;
    setToast?.({ show: true, msg: "Publishing to Bluesky..." });

    try {
      const response = await fetch('/api/share-bluesky', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: bskyText,
          coverImageUrl: p.cover_photo_url,
          locationName
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}: Failed to post to Bluesky`);
      }

      await updateSupabasePostStatus(p.id, 'bluesky');
      setToast?.({ show: true, msg: "Shared to Bluesky!" });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
    } catch (err) {
      console.error("Bluesky Error:", err);
      setToast?.({ show: true, msg: `Bluesky Error: ${err.message}` });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 4000);
    }
  };

  // --- PINTEREST ---
  const handlePinterestShare = async (p) => {
    if (!p) return;

    if (!p.cover_photo_url) {
      if (typeof setToast === 'function') {
        setToast({ show: true, msg: "No cover photo available to share!" });
        setTimeout(() => setToast({ show: false, msg: "" }), 3000);
      }
      return;
    }

    const locationName = p.place_name || "Island Vignette";
    const shareUrl = generateGalleryLink(locationName);

    const coreTags = "#MyJournal #SriLanka #TravelSriLanka #TravelPhotography";
    const dynamicHashtags = `${coreTags} ${getSpecificTags(p)}`.trim();

    let shortDesc = "";
    const fullStory = p.ai_article?.story || p.ai_article?.description;

    if (fullStory) {
      const cleanText = fullStory.replace(/[#*]/g, '').trim();
      const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];

      shortDesc = sentences[0].trim();
      if (shortDesc.length > 150) {
        shortDesc = shortDesc.substring(0, 147).trim();
        const lastSpace = shortDesc.lastIndexOf(" ");
        if (lastSpace > 0) shortDesc = shortDesc.substring(0, lastSpace);
        shortDesc += "...";
      }
    } else {
      shortDesc = `Breathtaking views at ${locationName}. A stunning escape in Sri Lanka.`;
    }

    const finalDescription = `${locationName} \n\n${shortDesc}\n\n📍Location: ${locationName}\n© Hasitha Gunasekera\n\n${dynamicHashtags}`;

    const pinterestUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(p.cover_photo_url)}&description=${encodeURIComponent(finalDescription)}`;

    const popup = window.open(pinterestUrl, '_blank', 'width=750,height=600');
    if (typeof setActivePinHubId === 'function') setActivePinHubId(null);

    if (popup) {
      try {
        await updateSupabasePostStatus(p.id, 'pinterest');
        setToast?.({ show: true, msg: "Synced Pinterest Status!" });
        setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
      } catch (err) {
        console.error("Pinterest DB sync failed:", err);
      }
    }
  };

  // --- FLIPBOARD ---
  const handleFlipboardShare = async (p) => {
    if (!p) return;

    const locationName = p.place_name || "Island Vignette";
    const shareLink = generateGalleryLink(locationName);

    const coreTags = "#MyJournal #SriLanka #TravelSriLanka #TravelPhotography";
    const dynamicHashtags = `${coreTags} ${getSpecificTags(p)}`.trim();

    let shortDesc = "";
    const storyText = p.ai_article?.story || p.ai_article?.description || "";

    if (storyText) {
      const cleanText = storyText.replace(/[#*]/g, '').trim();
      const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];

      for (let sentence of sentences) {
        const candidate = (shortDesc + " " + sentence.trim()).trim();
        if (candidate.length <= 300) {
          shortDesc = candidate;
        } else {
          break;
        }
      }
    } else {
      shortDesc = `Exploring the raw beauty of ${locationName}, Sri Lanka.`;
    }

    const fullTextToCopy = `${locationName}\n\n${shortDesc}\n\n📍Location: ${shareLink}\n\n${dynamicHashtags}`;

    try {
      await navigator.clipboard.writeText(fullTextToCopy);
      setToast?.({ show: true, msg: "Caption copied! Opening Flipboard..." });
    } catch (err) {
      console.error("Flipboard clipboard failure", err);
    }

    const targetUrl = p.cover_photo_url || shareLink;
    const flipboardUrl = `https://share.flipboard.com/bookmarklet/popout?v=2` +
      `&url=${encodeURIComponent(targetUrl)}` +
      `&title=${generateCleanSlug(locationName)}`;

    const popup = window.open(
      flipboardUrl,
      'flipboard-share',
      'width=700,height=680,scrollbars=yes,resizable=yes'
    );

    if (popup) {
      try {
        await updateSupabasePostStatus(p.id, 'flipboard');
        setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
      } catch (err) {
        console.error("Flipboard DB sync failed:", err);
      }
    }
  };

  // --- TWITTER (X) ---
  const handleTwitterPush = async (p, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!p) return;

    if (p.cover_photo_url) {
      downloadCoverImage(p.cover_photo_url, p.place_name);
    }

    if (p.published_twitter_at) {
      setToast?.({ show: true, msg: "Already shared to X / Twt!" });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
      return;
    }

    const locationName = p.place_name || "Island Vignette";
    const shareLink = generateGalleryLink(locationName);

    const coreTags = "#MyJournal #SriLanka #TravelSriLanka #TravelPhotography";
    const dynamicHashtags = `${coreTags} ${getSpecificTags(p)}`.trim();

    const storyText = p.ai_article?.story || p.ai_article?.description || "";
    const cleanText = storyText.replace(/[#*]/g, '').trim();

    const fixedCost = locationName.length + 18 + 23 + dynamicHashtags.length;
    const maxDescBudget = Math.max(0, 280 - fixedCost - 5);

    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    let shortDesc = "";

    for (let sentence of sentences) {
      const candidate = (shortDesc + " " + sentence.trim()).trim();
      if (candidate.length <= maxDescBudget) {
        shortDesc = candidate;
      } else {
        break;
      }
    }

    if (!shortDesc && cleanText && maxDescBudget > 3) {
      shortDesc = cleanText.substring(0, maxDescBudget).trim();
      const lastSpace = shortDesc.lastIndexOf(" ");
      if (lastSpace > 0) shortDesc = shortDesc.substring(0, lastSpace);
      shortDesc += "...";
    }

    const tweetText = `${locationName}\n\n${shortDesc}\n\n📍Location: ${shareLink}\n\n${dynamicHashtags}`;

    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    const popup = window.open(
      twitterIntentUrl,
      'twitter_intent',
      'width=550,height=420,scrollbars=yes,resizable=yes'
    );

    try {
      await navigator.clipboard.writeText(tweetText);
      setToast?.({ show: true, msg: "Caption copied! Opening X Composer..." });
    } catch (err) {
      console.error("Clipboard Error:", err);
    }

    if (popup) {
      try {
        await updateSupabasePostStatus(p.id, 'twitter');
        setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
      } catch (err) {
        console.error("Twitter DB sync failed:", err);
      }
    }
  };

  // --- UNSPLASH ---
  const handleUnsplashExport = async (p) => {
    if (!p || !p.cover_photo_url) {
      setToast?.({ show: true, msg: "No cover photo available to export!" });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
      return;
    }

    if (p.published_unplash_at) {
      setToast?.({ show: true, msg: "Already exported to Unsplash!" });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
      return;
    }

    try {
      const locationName = p.place_name || "Travel Spot";
      const galleryLink = `🌐: ${generateGalleryLink(locationName)}`;

      const tagsList = [
        "MyJournal,", "SriLanka,", "VisitSriLanka,", "TravelSriLanka,",
        "WanderlustSriLanka,", "BeautifulSriLanka,", "HiddenGemsSriLanka,",
        "SriLankaDiaries,", "ChasingWaterfalls,", "HikingAdventures,",
        "CampingLife,", "MountainViews,", "NatureSeekers,", "AdventureSriLanka,",
        "ExploreSriLanka,", "TravelPhotography,", "TravelDiaries,",
        "IslandParadise,", "ProtectNature,", "CeylonVibes,"
      ].join(" ");

      const description = p.description || p.journal_entry || "";
      const clipboardText = `${locationName}\n${galleryLink}\n\n${description}\n\n${tagsList}`.trim();

      await navigator.clipboard.writeText(clipboardText);

      const proxyUrl = `/api/cover-image-proxy?url=${encodeURIComponent(p.cover_photo_url)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Proxy fetch failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${generateCleanSlug(locationName)}-cover.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      const natureCategories = [
        "Waterfall", "Mountain", "Trail", "Viewpoint", "Beach",
        "Park", "Plateaus", "Reserved Forest", "Reservoir", "Pool", "Stream"
      ];

      const unsplashTopic = natureCategories.includes(p.category) ? "nature" : "travel";
      const targetUrl = `https://unsplash.com/t/${unsplashTopic}?modal=%5B%22Uploader%22%2C%5B%22Publish%22%2C%7B%22value%22%3A%22${unsplashTopic}%22%7D%5D%5D`;

      const popup = window.open(
        targetUrl,
        "unsplash_submit",
        "width=800,height=750,scrollbars=yes,resizable=yes"
      );

      if (popup) {
        try {
          await updateSupabasePostStatus(p.id, "unplash");
          p.published_unplash_at = new Date().toISOString();
        } catch (err) {
          console.error("Unsplash DB sync failed:", err);
        }
      }

      setToast?.({
        show: true,
        msg: "Caption & tags copied, image downloaded, and Unsplash opened!"
      });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 4000);

    } catch (err) {
      console.error("Unsplash Export Error:", err);
      setToast?.({ show: true, msg: "Failed to prepare Unsplash export." });
      setTimeout(() => setToast?.({ show: false, msg: "" }), 3000);
    }
  };


  // UTILITY & DATA SYNC FUNCTIONS ---

  const triggerToast = (msg) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 2500);
  };


  const triggerIndexNow = async (placeName, albumPhotos) => {
    try {
      const host = "www.myjournalview.com";

      // Standardized clean slug generation using the utility function
      const cleanSlug = generateCleanSlug(placeName);

      const urlsToSubmit = [`https://${host}/place/${cleanSlug}`];

      // Push the gallery route if album photos are present
      if (albumPhotos && albumPhotos.length > 0) {
        urlsToSubmit.push(`https://${host}/gallery/${cleanSlug}`);
      }

      const payload = {
        host: host,
        key: "24d0f44fba0b4dc7bf211372ab00f787",
        keyLocation: `https://${host}/24d0f44fba0b4dc7bf211372ab00f787.txt`,
        urlList: urlsToSubmit
      };

      const response = await fetch('/api/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        triggerToast("🚀 IndexNow notified of new links safely via backend!");
        return true; // <-- Tell the app it succeeded
      } else {
        console.error("IndexNow failed via proxy:", result.error || response.status);
        return false; // <-- Tell the app it failed
      }
    } catch (error) {
      console.error("IndexNow integration error:", error);
      return false; // <-- Tell the app it failed
    }
  };

  /**
 * Helper function to bypass Supabase's default 1000-row limit.
 * Fetches all records from a specified table in chunks.
 *
 * @param {string} tableName - The name of the Supabase table.
 * @param {string} orderByColumn - The column to sort by (default: 'created_at').
 * @param {boolean} ascending - Sort order (default: false).
 * @returns {Promise<Array>} - A promise that resolves to the complete array of records.
 */
  const fetchAllRecords = async (tableName, orderByColumn = 'created_at', ascending = false) => {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from(tableName)
        .select('*')
        .order(orderByColumn, { ascending })
        .range(from, from + step - 1);

      // Throw error to be caught by the try-catch block in refreshAllData
      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += step;
      }

      // Stop fetching if the returned data is less than the chunk size (meaning we hit the end)
      if (!data || data.length < step) {
        hasMore = false;
      }
    }

    return allData;
  };

  /**
   * Synchronizes all application data from Supabase.
   * Uses the pagination helper for the large 'travel_bucket_list' table 
   * and concurrent requests for everything else to optimize loading time.
   */
  const refreshAllData = async () => {
    try {
      // Fetch all data concurrently. 
      // Note: fetchAllRecords returns the data array directly, 
      // while standard Supabase queries return an object: { data, error }
      const [
        placesData,
        sr,
        v,
        a,
        c,
        l,
        sub
      ] = await Promise.all([
        fetchAllRecords('travel_bucket_list'), // Uses helper for >1000 records
        supabaseClient.from('saved_travel_routes').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
        supabaseClient.from('page_visits').select('*').limit(20000),
        supabaseClient.from('pending_approvals').select('*').order('created_at', { ascending: false }),
        supabaseClient.from('location_comments').select('*, travel_bucket_list(place_name)').order('created_at', { ascending: false }),
        supabaseClient.from('location_likes').select('*, travel_bucket_list(place_name)'),
        supabaseClient.from('subscribers').select('*').order('subscribed_at', { ascending: false })
      ]);

      // Handle specific non-fatal errors for standard queries
      if (sub.error) console.error("Subscribers fetch error:", sub.error);
      if (sr.error) console.error("Saved routes fetch error:", sr.error);

      // Update state with fetched data, falling back to empty arrays if undefined
      setPlaces(placesData || []);
      setSavedRoutes(sr.data || []);
      setAnalyticsData(v.data || []);
      setPendingApprovals(a.data || []);
      setAllComments(c.data || []);
      setLikesData(l.data || []);
      setSubscribersData(sub.data || []);

      console.log("Fetched subscribers:", sub.data);

    } catch (error) {
      // Catch and log any fatal errors (including those thrown by fetchAllRecords)
      console.error("Data sync error:", error);
      triggerToast("Failed to sync database.");
    }
  };



  // --- HEADER: ADD LOCATION FUNCTIONS ---



  const initGoogle = async () => {

    if (!autocompleteRef.current) {
      triggerToast("Autocomplete input not found in DOM yet.");
      return;
    }

    try {
      const { Autocomplete } = await google.maps.importLibrary("places");

      // Pass the raw DOM element (autocompleteRef.current)
      const autocomplete = new Autocomplete(autocompleteRef.current, {
        componentRestrictions: { country: "lk" },
        fields: ["name", "geometry", "address_components", "url"]
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry) return;

        setStagedLocation({
          place_name: place.name,
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng(),
          locality: place.address_components?.[0]?.long_name || "Unknown Area",
          google_maps_url: place.url,
          category: VALID_CATEGORIES[0]
        });
      });
    } catch (err) {

    }
  };

  useEffect(() => {
    if (isLoggedIn && autocompleteRef.current) {
      initGoogle();
    }
  }, [isLoggedIn]);



  // --- TAB 1: PLACES FUNCTIONS ---
  const updatePlaceField = async (id, field, value) => {
    // 1. Prepare update object. Ensure value isn't undefined to prevent DB errors.
    const updateData = { [field]: value || null };

    // 2. Update timestamp if status changes
    if (field === 'status') {
      updateData.created_at = new Date().toISOString();
    }

    const { error } = await supabaseClient
      .from('travel_bucket_list')
      .update(updateData)
      .eq('id', id);

    if (!error) {
      triggerToast('Updated Successfully');
      refreshAllData();
    } else {

      triggerToast(`Update Failed: ${error.message}`);
    }
  };

  const saveStagedLocation = async () => {
    if (!stagedLocation) return;

    const { error } = await supabaseClient
      .from('travel_bucket_list')
      .insert([{
        ...stagedLocation,
        status: 'pending',
        restriction_level: 'None',
        governing_org: 'Open',
        is_indexed: false,
        created_at: new Date()
      }]);

    if (!error) {
      triggerToast('Location Saved Successfully');
      setStagedLocation(null);
      if (autocompleteRef.current) autocompleteRef.current.value = '';
      refreshAllData();
    } else {

      triggerToast('Error Saving Location');
    }
  };

  const promptForValue = (id, field, currentVal, title) => {
    const val = prompt(`Enter ${title}:`, currentVal || '');

    if (val !== null) {
      let processedVal = val.trim();

      // Automatically fix Google Photos internal session URLs to public CDN URLs
      if (processedVal.includes("photos.fife.usercontent.google.com")) {
        processedVal = processedVal.replace(
          "photos.fife.usercontent.google.com",
          "lh3.googleusercontent.com"
        );

        // Also ensure it forces secure HTTPS protocol for Vercel compliance
        if (processedVal.startsWith("http://")) {
          processedVal = processedVal.replace("http://", "https://");
        }
      }

      updatePlaceField(id, field, processedVal);
    }
  };

  useEffect(() => {
    if (!userCoords) return;
    const dist = L.latLng(sortCenter.lat, sortCenter.lng).distanceTo(L.latLng(userCoords.lat, userCoords.lng));
    if (dist > 500) { // 500 meters
      setSortCenter(userCoords);
    }
  }, [userCoords]);

  const processedPlaces = useMemo(() => {
    // 1. Filtering Logic
    const filtered = places.filter(place => {
      const name = (place.place_name || "").toLowerCase();
      const locality = (place.locality || "").toLowerCase();

      const searchLower = debouncedSearch.toLowerCase();
      const matchesSearch = name.includes(searchLower) || locality.includes(searchLower);

      const matchesCat = filterCategory === 'All' || place.category === filterCategory;
      const matchesStatus = filterStatus === 'All' || place.status === filterStatus;

      return matchesSearch && matchesCat && matchesStatus;
    });

    // 2. Sorting Logic 
    return [...filtered].sort((a, b) => {
      if (sortBy === 'distance') {
        // Safe check for 'a' coordinates
        const latA = parseFloat(a.latitude);
        const lngA = parseFloat(a.longitude);
        const distA = (!isNaN(latA) && !isNaN(lngA))
          ? L.latLng(sortCenter.lat, sortCenter.lng).distanceTo(L.latLng(latA, lngA))
          : Infinity; // Push invalid locations to the bottom

        // Safe check for 'b' coordinates
        const latB = parseFloat(b.latitude);
        const lngB = parseFloat(b.longitude);
        const distB = (!isNaN(latB) && !isNaN(lngB))
          ? L.latLng(sortCenter.lat, sortCenter.lng).distanceTo(L.latLng(latB, lngB))
          : Infinity; // Push invalid locations to the bottom

        return distA - distB;
      }

      // Default sort (Newest First)
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

  }, [places, debouncedSearch, filterCategory, filterStatus, sortBy, sortCenter]);

  const deleteLocation = async (id, name) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      const { error } = await supabaseClient
        .from('travel_bucket_list')
        .delete()
        .eq('id', id);

      if (!error) {
        triggerToast('Location Deleted');
        refreshAllData();
      } else {
        triggerToast('Error Deleting Location');
      }
    }
  };


  const generateTravelArticle = async (place) => {

    // FIX: Dynamically fetch the API key to ensure it captures the populated value after login
    const currentApiKey = window.ARTICLE_KEY || import.meta.env.VITE_ARTICLE_KEY;
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentApiKey}`;

    const contextPrompt = `Write an authentic, first-person travel journal entry for a ${place.category} named "${place.place_name}" located in ${place.locality || 'Sri Lanka'}. 

    CRITICAL TONE & STYLE INSTRUCTIONS:
    - Write this like a real human sharing a personal travel diary. The tone should be conversational, passionate, and grounded. 
    - Include the reality of the journey: mention elements like navigating rocky terrain, a long motorcycle road trip, setting up camp, or hunting down hidden waterfalls. 
    - Focus on sensory details: the mist in the air, the sound of cascading water, or the feeling of the trail underfoot.
    - Mention capturing the experience on an iPhone and the satisfaction of dialing in the perfect color grades and LUTs on mobile.
    - Avoid mentioning drones or specific hardware model numbers.
    - STRICTLY AVOID cliché AI buzzwords. Do NOT use words like: "tapestry," "realm," "nestled," "unveil," "symphony," "breathtaking," "embark," or "delve." Use natural, everyday vocabulary.

    Return ONLY a JSON object with exactly this structure: 
    { 
      "title": "An engaging, natural-sounding title (avoid standard SEO clickbait formatting)", 
      "story": "A captivating 300-word first-person narrative about the visit, the vibe, and the journey to get there.", 
      "specs": "Brief, honest technical details about accessibility, terrain, or the best time to visit", 
      "meta": "A short, conversational meta description",
      "faq": [
        {
          "q": "A precise question focusing on practical travel utility (e.g., 'What is the difficulty level of the trek to ${place.place_name}?', 'When is the best season to visit ${place.place_name}?')",
          "a": "A direct, helpful response optimized for quick reading (1-2 sentences max)."
        },
        {
          "q": "Another practical user query (e.g., 'Are there specific permits or guides required to access ${place.place_name}?')",
          "a": "Clear, definitive answer containing localized geographical reference points and guidelines."
        }
      ]
    }`;

    const requestBody = {
      contents: [{
        parts: [{ text: contextPrompt }]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.75
      }
    };

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      // FIX: Throw error if API quota is exceeded or key is blocked
      if (data.error) {
        triggerToast("Gemini API Error:", data.error.message);
        throw new Error(data.error.message);
      }

      if (!data.candidates || !data.candidates[0].content.parts[0].text) {
        throw new Error("No content generated by AI.");
      }

      const aiJson = JSON.parse(data.candidates[0].content.parts[0].text);

      // Save to Supabase (this function now uses triggerToast internally)
      await saveArticleToDatabase(place.id, aiJson);

    } catch (err) {
      // Log locally, but re-throw so bulkGenerateArticles can catch it
      triggerToast("Fetch Error:", err.message);
      throw err;
    }
  };

  const generatePlaceMetadata = async (place) => {

    // FIX: Dynamically fetch the API key to ensure it captures the populated value after login
    const currentApiKey = window.ARTICLE_KEY || import.meta.env.VITE_ARTICLE_KEY;
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentApiKey}`;

    const metaPrompt = `Act as a Sri Lankan Geography & Environmental Regulation Expert. 
    Analyze the location: "${place.place_name}" (Locality: ${place.locality || 'Not Specified'}, Category: ${place.category}).

    STEP 1: Determine if this place is located within a larger protected area or reserve.
    Examples: 
    - "Chimney Pool" is inside "Horton Plains National Park".
    - "Dothaluoya Trail" or "Duwili Ella" is inside "Knuckles Forest Reserve".
    - "Piduruthalagala" is a "Strict Natural Reserve".

    STEP 2: Assign Governing Body based on the PARENT location:
    - National Parks/Sanctuaries -> "Department of Wildlife Conservation"
    - Forest Reserves/Sinharaja/Knuckles -> "Department of Forest Conservation"
    - Heritage Sites (Sigiriya/Anuradhapura) -> "Central Cultural Fund" or "Department of Archaeology"

    STEP 3: Set Restriction Level:
    - "None": Public areas/beaches.
    - "Low": Local trails with no entry fee.
    - "High": National Parks/Reserves requiring tickets/permits.
    - "Restricted": Strict Natural Reserves (e.g., Ritigala Peak, Hakgala SNR).

    Return ONLY this JSON structure:
    {
      "parent_area": "Name of the National Park or Reserve if applicable",
      "restriction_level": "None" | "Low" | "High" | "Restricted",
      "governing_org": "Open" | "Department of Wildlife Conservation" | "Department of Forest Conservation" | "Central Cultural Fund" | "Department of Archaeology" | "Department of National Botanic Gardens" | "National Livestock Development Board" | "Local Authorities"
    }`;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: metaPrompt }] }],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1
          }
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const aiJson = JSON.parse(data.candidates[0].content.parts[0].text);

      // --- BUSINESS RULE OVERRIDE ---
      // Force 'Low' restriction if governing body is 'Local Authorities'
      let finalRestriction = aiJson.restriction_level;
      if (aiJson.governing_org === 'Local Authorities') {
        finalRestriction = 'Low';
      }

      // Update Database
      const { error } = await supabaseClient
        .from('travel_bucket_list')
        .update({
          restriction_level: finalRestriction, // Use the enforced value
          governing_org: aiJson.governing_org
        })
        .eq('id', place.id);

      if (error) throw error;
      return true;
    } catch (err) {

      return false;
    }
  };

  const bulkUpdateMetadata = async () => {
    // Only target places marked 'done' where metadata is still default ('None'/'Open')
    const targets = places.filter(p => p.status === 'done' && (p.restriction_level === 'None' || p.governing_org === 'Open'));

    if (targets.length === 0) {
      triggerToast("No 'Done' places need updating.");
      return;
    }

    triggerToast(`Analyzing ${targets.length} locations...`);

    for (const place of targets) {
      const success = await generatePlaceMetadata(place);
      if (success) {
        await new Promise(r => setTimeout(r, 2000)); // Rate limiting safety
      }
    }

    triggerToast("Metadata audit complete!");
    refreshAllData();
  };

  const saveArticleToDatabase = async (id, articleData) => {
    try {
      const { error } = await supabaseClient
        .from('travel_bucket_list')
        .update({
          ai_article: articleData,
          status: 'done',
          is_indexed: false,
          created_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;


      setPlaces(prev => prev.map(p =>
        p.id === id ? { ...p, ai_article: articleData, status: 'done' } : p
      ));


      triggerToast("Journal entry successfully updated!");

    } catch (err) {

      triggerToast("Database update failed.");
    }
  };

  const manualEditArticle = (place) => {
    const currentStory = place.ai_article?.story || "";
    const newStory = prompt("Edit the AI Story text:", currentStory);

    if (newStory !== null && newStory !== currentStory) {
      const updatedData = {
        ...place.ai_article,
        story: newStory
      };
      saveArticleToDatabase(place.id, updatedData);
    }
  };


  const bulkGenerateArticles = async () => {
    // 1. Identify items currently missing their story narrative
    const targets = places.filter(p => p.status === 'done' && !p.ai_article?.story);

    if (targets.length === 0) {
      triggerToast("No pending articles found to process.");
      return;
    }

    triggerToast(`Processing ${targets.length} items...`);

    // 2. Sequential generation with automated safety cooldowns
    for (const place of targets) {
      let success = false;
      while (!success) { // Keep trying until this specific place is done
        try {
          await generateTravelArticle(place);
          success = true; // Move to next place
          await new Promise(r => setTimeout(r, 4000)); // 4s safety gap
        } catch (err) {
          if (err.message.includes("quota") || err.message.includes("429")) {
            triggerToast("Quota Full. Pausing for 65s...");
            await new Promise(r => setTimeout(r, 65000)); // Wait for API reset window
            // success remains false, so the 'while' loop will retry this 'place' again
          } else {
            triggerToast("Skipping due to non-quota error.");
            success = true; // Skip to avoid infinite loop on bad data
          }
        }
      }
    }

    triggerToast("Bulk generation finished!");

    // 3. Global state sync to display newly built stories
    if (typeof refreshAllData === 'function') {
      refreshAllData();
    }
  };

  /**
   * Automatically fetches active email subscribers from Supabase and dispatches 
   * a media-rich transactional notification alert via an internal serverless API proxy.
   * @param {Object} locationData - The raw location object payload from the database.
   */
  const notifySubscribersOnCompletion = async (locationData) => {
    if (!supabaseClient) {
      console.error("Supabase engine not initialized; email broadcast failed.");
      return;
    }

    try {
      // 1. Fetch active subscriber email payloads directly from Supabase 
      const { data: subscribers, error: subError } = await supabaseClient
        .from('subscribers')
        .select('email')
        .eq('is_active', true);

      if (subError) throw subError;
      if (!subscribers || subscribers.length === 0) {
        console.log("No active subscribers found in database. Email dispatch aborted.");
        return;
      }

      const emailList = subscribers.map(s => s.email);

      // 2. Parse and apply structural Google Photos proxy URL transformations 
      let emailCoverImageUrl = '';
      if (locationData.cover_photo_url) {
        let targetUrl = locationData.cover_photo_url.replace(/^http:\/\//i, 'https://');
        const baseUrl = targetUrl.split('=')[0];
        emailCoverImageUrl = `${baseUrl}=w600-h338-c`;
      }

      // Construct the exact dynamic URL to open the gallery on your website
      const locationName = locationData.place_name || 'Remote Target Location';

      // REVISED: Changed to /gallery/ routing scheme using the utility slug function
      const galleryLink = `https://www.myjournalview.com/gallery/${generateCleanSlug(locationName)}`;

      // 3. Construct the batch delivery payload container array mapping over each subscriber
      const emailPayload = emailList.map(subscriberEmail => ({
        from: 'My Journal Expedition Logs <notifications@info.myjournalview.com>',
        to: [subscriberEmail],
        subject: `🧭 New Horizon Unlocked: ${locationName} is Live`,
        html: `
   <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">

   ${emailCoverImageUrl ? `
   <div style="width: 100%; aspect-ratio: 16/9; max-height: 280px; overflow: hidden; border-radius: 16px; margin-bottom: 20px; background-color: #f1f5f9;">
  <img 
    src="${emailCoverImageUrl}" 
    alt="${locationName}" 
    style="width: 100%; height: 100%; object-fit: cover; display: block; max-height: 280px;"
  />
   </div>
  ` : ''}

   <h2 style="text-transform: uppercase; letter-spacing: 0.08em; color: #4f46e5; font-size: 18px; font-weight: 900; margin-top: 0; margin-bottom: 8px;">
   The Map Expands
   </h2>

   <p style="font-size: 14px; color: #64748b; margin-top: 0; margin-bottom: 20px; line-height: 1.5;">
   The latest field logs have been meticulously polished, verified, and are officially <strong style="color: #10b981;">Ready for Discovery</strong>.
   </p>

   <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
  <tr>
  <td style="padding: 6px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #94a3b8; width: 130px; vertical-align: top;">Location Name:</td>
  <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #0f172a; vertical-align: top; text-transform: uppercase;">${locationName}</td>
   </tr>
   <tr>
  <td style="padding: 6px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #94a3b8; vertical-align: top;">Region/Locality:</td>
  <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #475569; vertical-align: top; text-transform: uppercase;">${locationData.locality || 'Verified Terrain'}</td>
   </tr>
    <tr>
  <td style="padding: 6px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #94a3b8; vertical-align: top;">Category:</td>
  <td style="padding: 6px 0; font-size: 11px; font-weight: 800; color: #4f46e5; vertical-align: top; text-transform: uppercase;">
    <span style="background-color: #e0e7ff; padding: 3px 8px; border-radius: 6px; display: inline-block;">${locationData.category || 'Exploration Zone'}</span>
  </td>
    </tr>
   </table>

   <div style="margin-top: 28px; margin-bottom: 12px;">
    <!-- REVISED: Updated href to galleryLink and inner text to View Gallery -->
    <a href="${galleryLink}" target="_blank" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: 900; border-radius: 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
  View Gallery
    </a>
   </div>
   </div> `
      }));

      // 4. Securely dispatch the payload to your internal backend proxy handler
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emailPayload })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Server proxy error encountered with status code: ${response.status}`);
      }

      console.log(`Successfully broadcasted field update notification to ${emailList.length} subscribers via serverless API proxy.`);
    } catch (err) {
      console.error("Background Email Notification Dispatch Failed:", err.message || err);
    }
  };


  // ============================================================================
  // --- TAB 2: MAP FUNCTIONS, ROUTING & SHARING ---
  // ============================================================================

  // --- 1. MAP CORE LIFECYCLE EFFECT ---

  React.useEffect(() => {
    let timer;

    if (activeTab === 'map') {
      // Use requestAnimationFrame or a short timeout to ensure React paints the DOM
      timer = setTimeout(() => {
        // 1. Target the element explicitly
        const container = document.getElementById('map-container');

        // 2. Defensive guard: If React hasn't mounted it yet, safely abort
        if (!container) return;

        // Initialize map instance if it doesn't already exist
        if (!mapRef.current) {
          // 3. Pass the DOM element variable directly instead of the string ID
          const map = L.map(container, {
            zoomControl: false,
            attributionControl: false,
            fadeAnimation: true
          }).setView([HomePoint.lat, HomePoint.lng], 8); // Centered on Sri Lanka

          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png')
            .addTo(map);

          markersLayer.current.addTo(map);
          mapRef.current = map;
          setMapReady(true);
        } else {
          // Force map re-render/resize when returning to tab
          mapRef.current.invalidateSize();
          setMapReady(true);
        }
      }, 150);
    } else {
      setMapReady(false);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [activeTab]);



  // --- 2. ACTIVE TRIP & WEATHER SIDE EFFECT ---
  // Resets route names when the trip is cleared, and triggers weather fetches.
  React.useEffect(() => {
    // Reset active route details when trip is cleared
    if (selectedTrip.length === 0) {
      setActiveRouteName('');
      if (setRouteWeather) setRouteWeather(null);
      return;
    }

    // Fetch route weather when in map view with active locations
    if (activeTab === 'map' && typeof fetchRouteWeather === 'function') {
      fetchRouteWeather(selectedTrip);
    }
  }, [selectedTrip, activeTab]);


  // --- 3. MARKER RENDERING & UPDATES ---
  const updateMapMarkers = React.useCallback(() => {
    // Safety check for Leaflet refs
    if (!mapRef.current || !markersLayer.current) return;

    // Performance: Clear existing layers before repainting
    markersLayer.current.clearLayers();

    // Optimization: Use debouncedSearch to prevent lag during typing
    const displayList = debouncedSearch ? filteredPlaces : places;

    displayList.forEach(p => {
      if (!p.latitude || !p.longitude) return;

      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      // Determine marker styling state
      const isSelected = selectedTrip.some(item => item.id === p.id);
      const markerClass = isSelected
        ? 'marker-selected'
        : (p.status === 'done' ? 'marker-done' : 'marker-pending');

      const icon = L.divIcon({
        className: `${markerClass} shadow-md transition-all duration-200 hover:scale-150`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      const marker = L.marker([lat, lng], { icon });

      // Custom Popup Setup
      marker.bindPopup(`
      <div class="p-1">
        <p class="m-0 font-black text-[10px] text-slate-800 uppercase tracking-tighter">
          ${p.place_name}
        </p>
        <div class="flex items-center gap-1 mt-1">
          <span class="h-1 w-1 rounded-full bg-${p.status === 'done' ? 'emerald' : 'orange'}-500"></span>
          <p class="m-0 text-[8px] text-slate-400 font-bold uppercase">${p.category}</p>
        </div>
      </div>
    `, { closeButton: false, className: 'custom-map-popup' });

      // Interaction Handlers
      marker.on('mouseover', function () { this.openPopup(); });
      marker.on('mouseout', function () { this.closePopup(); });
      marker.on('click', () => {
        mapRef.current.setView([lat, lng], 13);
      });

      marker.addTo(markersLayer.current);
    });
  }, [places, filteredPlaces, debouncedSearch, selectedTrip]);


  // --- 4. ROUTE CALCULATION & MANAGEMENT ---

  // Calculates total route distance from origin (sortCenter) through selected waypoints
  const calculateRouteDistance = () => {
    const startPoint = L.latLng(sortCenter.lat, sortCenter.lng);
    let totalDistance = 0;
    let currentPos = startPoint;

    selectedTrip.forEach((point) => {
      const destination = L.latLng(parseFloat(point.latitude), parseFloat(point.longitude));
      totalDistance += currentPos.distanceTo(destination) / 1000; // Convert meters to KM
      currentPos = destination;
    });

    return totalDistance.toFixed(1);
  };

  // Saves current trip selection to database and resets active state
  const handleSaveRoute = async () => {
    if (!selectedTrip || selectedTrip.length === 0) {
      triggerToast("Add at least one location to save a route.");
      return;
    }

    const routeName = prompt("Enter a name for this route:");
    if (!routeName || !routeName.trim()) return;

    try {
      const waypointsPayload = selectedTrip.map(p => ({
        id: p.id,
        place_name: p.place_name || p.n,
        latitude: p.latitude || p.lt,
        longitude: p.longitude || p.ln,
        category: p.category || 'Location',
        // Legacy compatibility keys
        lt: p.latitude || p.lt,
        ln: p.longitude || p.ln,
        n: p.place_name || p.n
      }));

      const { error } = await supabaseClient
        .from('saved_travel_routes')
        .insert([{
          route_name: routeName.trim(),
          waypoints: JSON.stringify(waypointsPayload)
        }]);

      if (error) throw error;

      await refreshAllData();
      setSelectedTrip([]);
      setActiveRouteName(''); // Reset active route name upon saving
      triggerToast("Route saved successfully!");
    } catch (err) {
      console.error("Save Route Error:", err);
      triggerToast("Failed to save route: " + (err.message || "Unknown error"));
    }
  };

  // Loads a saved route into current trip selection and sets display header
  const handleLoadRoute = (route) => {
    try {
      const waypoints = typeof route.waypoints === 'string'
        ? JSON.parse(route.waypoints)
        : route.waypoints;

      if (!waypoints || waypoints.length === 0) {
        triggerToast("Selected route has no saved waypoints.");
        return;
      }

      const formattedTrip = waypoints.map(wp => ({
        id: wp.id || `saved-${Math.random()}`,
        place_name: wp.place_name || wp.n || "Saved Waypoint",
        latitude: wp.latitude || wp.lt,
        longitude: wp.longitude || wp.ln,
        category: wp.category || "Location"
      }));

      setSelectedTrip(formattedTrip);
      setActiveRouteName(route.route_name || ""); // Track and display active route name
      triggerToast(`Loaded "${route.route_name}" into active trip!`);
    } catch (err) {
      console.error("Load Route Error:", err);
      triggerToast("Failed to load saved route.");
    }
  };

  // Deletes route plan from Supabase database
  const deleteRoute = async (id) => {
    if (confirm("Delete this route plan?")) {
      const { error } = await supabaseClient.from('saved_travel_routes').delete().eq('id', id);
      if (!error) {
        triggerToast('Route Deleted');
        refreshAllData();
      }
    }
  };


  // --- 5. UNIVERSAL SHARING & QR SYSTEM ---

  // Constructs deep-link URL for Google Maps directions
  const generateGoogleMapsUrl = (points) => {
    if (!points || points.length === 0) return null;

    const baseUrl = "https://www.google.com/maps/dir/";
    const stops = points.map(p => {
      const lat = p.latitude !== undefined ? p.latitude : p.lt;
      const lng = p.longitude !== undefined ? p.longitude : p.ln;
      return `${lat},${lng}`;
    }).join('/');

    return `${baseUrl}${stops}`;
  };

  // Direct WhatsApp sharing handler for current trip
  const handleWhatsAppShare = () => {
    const link = generateGoogleMapsUrl(selectedTrip);
    if (!link) {
      triggerToast("Add some places to your trip first!");
      return;
    }

    const locationsList = selectedTrip
      .map((p, idx) => `${idx + 1}. ${p.place_name || p.n || 'Unknown Stop'}`)
      .join('\n');

    const messageText = `📍 Current Trip Route\n\nLocations:\n${locationsList}\n\n🗺️ Google Maps Link:\n${link}`;
    const encodedText = encodeURIComponent(messageText);

    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
  };

  // Opens QR Code Modal for active trip
  const handleShowQR = () => {
    if (!selectedTrip || selectedTrip.length === 0) {
      triggerToast("Add some places to your trip first!");
      return;
    }
    showQRCode(selectedTrip, activeRouteName || "Current Trip Route");
  };

  // Opens QR Code Modal for a saved route item
  const shareRoute = (route) => {
    try {
      const pts = typeof route.waypoints === 'string' ? JSON.parse(route.waypoints) : route.waypoints;
      if (!pts || pts.length === 0) {
        triggerToast("This route has no waypoints.");
        return;
      }
      showQRCode(pts, route.route_name || route.name || "Saved Route Plan");
    } catch (e) {
      triggerToast("Error processing route data.");
    }
  };

  // Modal UI generator for QR Code & Quick Links
  const showQRCode = (points, name = "My Travel Route") => {
    const universalUrl = generateGoogleMapsUrl(points);
    if (!universalUrl) return;

    // Cleanup existing open modals
    const existing = document.getElementById('qr-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = "qr-modal-overlay";
    overlay.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-6";

    const locationsList = points
      .map((pt, idx) => `${idx + 1}. ${pt.place_name || pt.n || 'Unknown Stop'}`)
      .join('\n');

    const fullShareContent = `🗺️ Route Plan: ${name}\n\nLocations:\n${locationsList}\n\n🔗 Google Maps Link:\n${universalUrl}`;

    const modal = document.createElement('div');
    modal.className = "bg-white p-6 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col items-center border border-slate-100 animate-in fade-in zoom-in-95 duration-150";
    modal.innerHTML = `
    <div class="w-full flex justify-between items-center mb-4">
      <h3 class="text-[11px] font-black uppercase tracking-wider text-slate-400">Share Route Plan</h3>
      <button id="close-qr-btn" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <p class="text-xs font-black uppercase text-slate-800 text-center mb-4 w-full truncate px-2 italic">${name}</p>

    <div class="bg-slate-50 p-4 rounded-xl mb-5 border border-slate-100 flex items-center justify-center shadow-inner">
      <div id="qrcode-canvas" class="mix-blend-multiply"></div>
    </div>

    <div class="grid grid-cols-2 gap-3 w-full">
      <button id="copy-link-btn" class="flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-slate-200 hover:bg-slate-800 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        Copy Info
      </button>
      <button id="whatsapp-modal-btn" class="flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.503-5.714-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.623-1.023-5.086-2.885-6.948C16.63 2.016 14.17 1 11.545 1 6.11 1 1.687 5.37 1.682 10.8c-.001 1.743.461 3.442 1.337 4.947l-1.01 3.694 3.79-.994z"/></svg>
        WhatsApp
      </button>
    </div>
  `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Render QR Code canvas safely
    setTimeout(() => {
      const qrContainer = document.getElementById("qrcode-canvas");
      if (qrContainer && window.QRCode) {
        new QRCode(qrContainer, {
          text: universalUrl,
          width: 160,
          height: 160,
          colorDark: "#0f172a",
          colorLight: "#f8fafc",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    }, 50);

    // Modal Event Listeners
    modal.querySelector('#close-qr-btn').onclick = () => overlay.remove();

    modal.querySelector('#copy-link-btn').onclick = () => {
      navigator.clipboard.writeText(fullShareContent);
      triggerToast("Route info copied to clipboard!");
    };

    modal.querySelector('#whatsapp-modal-btn').onclick = () => {
      const text = encodeURIComponent(fullShareContent);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    };
  };


  // --- 6. MISC TOGGLE HELPERS ---

  const toggleStatus = (id, currentStatus) => {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    updatePlaceField(id, 'status', newStatus);
  };

  const toggleSubscriberStatus = async (id, currentStatus) => {
    const newStatus = !currentStatus;

    try {
      const { error } = await supabaseClient
        .from('subscribers')
        .update({ is_active: newStatus })
        .eq('id', id);

      if (error) throw error;

      triggerToast(`Subscriber marked as ${newStatus ? 'Active' : 'Inactive'}`);
      refreshAllData();
    } catch (err) {
      console.error("Error updating subscriber:", err);
      triggerToast('Failed to update subscriber status');
    }
  };

  // --- TAB 3: DASHBOARD FUNCTIONS ---

  const dashboardStats = React.useMemo(() => {
    const safeAnalytics = Array.isArray(analyticsData) ? analyticsData : [];
    const safeLikes = Array.isArray(likesData) ? likesData : [];
    const safeSubscribers = Array.isArray(subscribersData) ? subscribersData : [];

    // Localized Set per recalculation to avoid state leakage across re-renders
    const knownUsers = new Set();

    const parseUA = (v) => {
      const rawUA = v.user_agent || "";
      const lowerUA = rawUA.toLowerCase();
      const referrer = (v.referrer || "").toLowerCase();
      const utmSource = (v.utm_source || "").toLowerCase();

      const ip = v.ip_address || "";
      const city = v.city || "";
      const country = v.country === "The Netherlands" ? "Netherlands" : (v.country || "Unknown");

      const fingerprint = `${ip}_${rawUA}`;

      // 1. Loyalty Check (Chronological execution based on sorted created_at)
      let loyaltyStatus = "Returning User";
      if (fingerprint !== "_" && !knownUsers.has(fingerprint)) {
        knownUsers.add(fingerprint);
        loyaltyStatus = "Unique Visit";
      }

      // 2. SYNCHRONIZED BOT & NETWORK DETECTION MATRIX
      const botPatterns = [
        'bot', 'spider', 'crawl', 'lighthouse', 'slurp',
        'facebookexternalhit', 'twitterbot', 'google-safety',
        'headless', 'inspect', 'preview', 'pinterestbot',
        'clarity', 'bingbot', 'msnbot', 'duckduckbot',
        'googleother', 'google-read-aloud', 'gtmetrix', 'adsense',
        'meta-externalagent', 'meta-externalfetcher', 'facebookbot',
        'facebot', 'meta-webindexer', 'meta-externalads',
        'applebot', 'googlebot', 'baiduspider', 'yandexbot',
        'ia_archiver', 'screaming frog', 'adsbot'
      ];

      // Data Center IP Prefixes (AWS, Google Cloud, Meta, Azure)
      const isDataCenterNetwork =
        ip.startsWith('66.220.') || ip.startsWith('173.252.') ||
        ip.startsWith('31.13.') || ip.startsWith('66.249.') ||
        ip.startsWith('74.125.') || ip.startsWith('34.') ||
        ip.startsWith('35.') || ip.startsWith('104.') ||
        ip.startsWith('20.') || ip.startsWith('3.') ||
        ip.startsWith('52.') || ip.startsWith('54.') ||
        ip.startsWith('69.171.');

      const isBot =
        botPatterns.some(pattern => lowerUA.includes(pattern)) ||
        lowerUA.includes('headlesschrome') ||
        v.is_webdriver === true ||
        isDataCenterNetwork;

      // 3. SOURCE DETECTION (Incorporating UA, Referrer, and UTM Source)
      let finalSource = "Direct";

      if (isBot) {
        if (lowerUA.includes('facebook') || lowerUA.includes('meta') || ip.startsWith('31.13.') || ip.startsWith('66.220.') || ip.startsWith('69.171.')) {
          finalSource = 'Meta Scraper';
        } else if (lowerUA.includes('google') || ip.startsWith('66.249.')) {
          finalSource = 'Google Bot';
        } else if (lowerUA.includes('twitter')) {
          finalSource = 'Twitter Bot';
        } else if (lowerUA.includes('pinterest')) {
          finalSource = 'Pinterest Bot';
        } else {
          finalSource = 'Automated Crawler';
        }
      } else {
        // Check explicit UTM source first
        if (utmSource) {
          if (utmSource.includes('facebook') || utmSource.includes('fb')) finalSource = 'Facebook';
          else if (utmSource.includes('instagram') || utmSource.includes('ig')) finalSource = 'Instagram';
          else if (utmSource.includes('twitter') || utmSource.includes('x')) finalSource = 'Twitter(X)';
          else if (utmSource.includes('newsletter') || utmSource.includes('email')) finalSource = 'Email / Newsletter';
          else finalSource = utmSource.charAt(0).toUpperCase() + utmSource.slice(1);
        }
        // Search Engines
        else if (
          lowerUA.includes('google') || lowerUA.includes('bing') || lowerUA.includes('yahoo') ||
          lowerUA.includes('duckduckgo') || lowerUA.includes('ecosia') ||
          referrer.includes('google.') || referrer.includes('bing.com') || referrer.includes('duckduckgo.com')
        ) {
          finalSource = 'Search Engine';
        }
        // Meta Ecosystem
        else if (lowerUA.includes('messenger') || lowerUA.includes('fb_iab')) finalSource = 'Messenger';
        else if (lowerUA.includes('instagram') || referrer.includes('instagram.com')) finalSource = 'Instagram';
        else if (lowerUA.includes('threads') || lowerUA.includes('barcelona')) finalSource = 'Threads';
        else if (lowerUA.includes('fban') || lowerUA.includes('fbav') || referrer.includes('facebook.com')) finalSource = 'Facebook';
        // Other Social Platforms
        else if (lowerUA.includes('tiktok') || lowerUA.includes('musical')) finalSource = 'TikTok';
        else if (lowerUA.includes('whatsapp')) finalSource = 'WhatsApp';
        else if (lowerUA.includes('surf.social')) finalSource = 'Surf.Social';
        else if (lowerUA.includes('youtube') || lowerUA.includes('com.google.android.youtube') || referrer.includes('youtube.com')) finalSource = 'YouTube';
        else if (lowerUA.includes('reddit') || referrer.includes('reddit.com')) finalSource = 'Reddit';
        else if (lowerUA.includes('unsplash')) finalSource = 'Unsplash';
        else if (lowerUA.includes('elakiri')) finalSource = 'Elakiri';
        else if (lowerUA.includes('pinterest') || referrer.includes('pinterest.com')) finalSource = 'Pinterest';
        else if (lowerUA.includes('flipboard')) finalSource = 'Flipboard';
        else if (lowerUA.includes('twitter') || lowerUA.includes(' x/') || referrer.includes('t.co') || referrer.includes('twitter.com')) finalSource = 'Twitter(X)';
        else if (lowerUA.includes('mastodon') || lowerUA.includes('ivory') || lowerUA.includes('tusky')) finalSource = 'Mastodon';
        else if (lowerUA.includes('bsky') || lowerUA.includes('bluesky')) finalSource = 'Bluesky';
        else {
          finalSource = "Direct";
        }
      }

      // 4. DEVICE & OS DETECTION
      let type = 'Desktop';
      if (lowerUA.includes('tablet') || lowerUA.includes('ipad')) type = 'Tablet';
      else if (lowerUA.includes('mobile') || lowerUA.includes('android') || lowerUA.includes('iphone')) type = 'Mobile';

      if (isBot) type = 'Bot/Server';

      let os = 'Other';
      if (rawUA.includes('Windows')) os = 'Windows';
      else if (rawUA.includes('Android')) os = 'Android';
      else if (rawUA.includes('iPhone') || rawUA.includes('iPad')) os = 'iOS';
      else if (rawUA.includes('Mac OS')) os = 'macOS';
      else if (rawUA.includes('Linux')) os = 'Linux';

      if (isBot) os = 'Server OS';

      // Normalize page path casing to prevent fragmented route stats (e.g., 'Gallery/diva guhawa')
      const rawPath = v.page_path || 'Unknown';
      const normalizedPagePath = rawPath.includes('/')
        ? rawPath.split('/').map(part => part.trim().toLowerCase()).join('/')
        : rawPath;

      return { type, source: finalSource, os, isBot, loyaltyStatus, country, normalizedPagePath };
    };

    // Sort analytics chronologically prior to computing loyalty status
    const parsedData = [...safeAnalytics]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(v => ({ ...v, ...parseUA(v) }));

    const latestMetrics = parsedData.length > 0 ? parsedData[parsedData.length - 1] : null;

    const getSortedMetrics = (data, keyOrFn) => {
      const counts = data.reduce((acc, item) => {
        const val = typeof keyOrFn === 'function' ? keyOrFn(item) : (item[keyOrFn] || 'Unknown');
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    };

    return {
      latest: latestMetrics,
      totalVisits: parsedData.length,
      totalSubscribers: safeSubscribers.length,
      countries: getSortedMetrics(parsedData, 'country'),
      regions: getSortedMetrics(parsedData, 'region'),
      cities: getSortedMetrics(parsedData, 'city'),
      sources: getSortedMetrics(parsedData, 'source'),
      deviceTypes: getSortedMetrics(parsedData, 'type'),
      loyalty: getSortedMetrics(parsedData, 'loyaltyStatus'),
      pageHistory: getSortedMetrics(parsedData, 'normalizedPagePath')
        .filter(([path, count]) => count > 0 && path && path !== 'unknown'),
      os: getSortedMetrics(parsedData, 'os'),
      trafficType: getSortedMetrics(parsedData, v => v.isBot ? 'Bot/Crawler' : 'Real Person'),

      likesSummary: safeLikes.reduce((acc, l) => {
        const locName = l.travel_bucket_list?.place_name || 'Unknown Location';
        const category = l.travel_bucket_list?.category || 'General';
        const country = l.country || 'Unknown';

        const existing = acc.find(x => x.name === locName);
        if (existing) {
          existing.hits += 1;
          existing.countries[country] = (existing.countries[country] || 0) + 1;
        } else {
          acc.push({
            name: locName,
            category: category,
            hits: 1,
            countries: { [country]: 1 }
          });
        }
        return acc;
      }, []).sort((a, b) => b.hits - a.hits)
    };
  }, [analyticsData, likesData, subscribersData]);

/**
 * Circular Progress Ring Indicator for Dashboard Refresh Countdown
 */
const RefreshProgressCircle = React.memo(({ timeLeft, totalTime = 600 }) => {
  const radius = 9;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * radius; // ~56.55px

  // Calculate percentage elapsed
  const progress = Math.max(0, Math.min(1, (totalTime - timeLeft) / totalTime));
  const strokeDashoffset = circumference * (1 - progress);

  // Format MM:SS for hover tooltip
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div 
      className="relative flex items-center justify-center group cursor-pointer"
      title={`Auto-refreshes in ${formattedTime}`}
    >
      <svg className="w-5 h-5 -rotate-90 transform" viewBox="0 0 24 24">
        {/* Background Track Circle */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-700/50 fill-none"
        />
        {/* Animated Progress Circle */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-orange-500 fill-none transition-all duration-1000 ease-linear"
        />
      </svg>
      {/* Dynamic pulse dot in the center */}
      <span className="absolute h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
    </div>
  );
});

  const handleClearDashboardData = async () => {
    if (window.confirm("⚠️ Are you sure you want to delete all analytics records (page_visits)? This operation cannot be undone.")) {
      try {
        // Deletes all rows from page_visits table where created_at is not null
        const { error } = await supabaseClient
          .from('page_visits')
          .delete()
          .neq('created_at', '1970-01-01T00:00:00Z');

        if (error) throw error;

        setAnalyticsData([]); // Clear local state instantly
        triggerToast("Dashboard page visits data cleared successfully.");
        refreshAllData();
      } catch (err) {
        console.error("Error clearing page_visits:", err);
        triggerToast("Failed to clear analytics data: " + err.message);
      }
    }
  };


  // --- DASHBOARD ACTIONS (Comments & Suggestions) ---

  const submitCommentReply = async (commentId, inputId) => {
    const inputElement = document.getElementById(inputId);
    const replyText = inputElement?.value.trim();

    if (!replyText) {
      triggerToast("Please enter a reply");
      return;
    }

    const { error } = await supabaseClient
      .from('location_comments')
      .update({ reply_text: replyText })
      .eq('id', commentId);

    if (!error) {
      triggerToast('Reply Posted Successfully');
      inputElement.value = ""; // Clear input
      refreshAllData(); // Refresh UI
    } else {
      triggerToast('Failed to post reply');

    }
  };

  const deleteLocationComment = async (id) => {
    if (confirm("Are you sure you want to delete this comment?")) {
      try {
        const { error } = await supabaseClient
          .from('location_comments')
          .delete()
          .eq('id', id);

        if (error) throw error;

        triggerToast('Comment Deleted');
        refreshAllData();
      } catch (err) {

        triggerToast('Failed to delete comment');
      }
    }
  };



  // Handles Approve/Reject for Suggestion Approvals
  const handleSuggestionAction = async (suggestionId, action) => {
    try {
      if (action === 'rejected') {
        // 1. DELETE FROM PENDING TABLE
        const { error: deleteError } = await supabaseClient
          .from('pending_approvals')
          .delete()
          .eq('id', suggestionId);

        if (deleteError) throw deleteError;
        triggerToast('Suggestion Removed');

      } else if (action === 'approved') {
        // 1. FETCH DATA FROM PENDING TABLE FIRST
        const { data: suggestion, error: fetchError } = await supabaseClient
          .from('pending_approvals')
          .select('*')
          .eq('id', suggestionId)
          .single();

        if (fetchError) throw fetchError;


        // 2. INSERT INTO TRAVEL_BUCKET_LIST

        const { error: insertError } = await supabaseClient
          .from('travel_bucket_list')
          .insert([{
            place_name: suggestion.place_name,
            google_maps_url: suggestion.map_url,
            latitude: suggestion.latitude,
            longitude: suggestion.longitude,
            category: suggestion.category,
            locality: suggestion.locality,
            status: 'pending',
            restriction_level: 'None',
            governing_org: 'Open',
            is_indexed: false,
            created_at: new Date().toISOString()
          }]);

        if (insertError) throw insertError;

        // 3. REMOVE FROM PENDING TABLE AFTER SUCCESSFUL MOVE
        const { error: deleteError } = await supabaseClient
          .from('pending_approvals')
          .delete()
          .eq('id', suggestionId);

        if (deleteError) throw deleteError;
        triggerToast('Location Added to Bucket List');
      }

      // Refresh UI data
      refreshAllData();

    } catch (err) {

      triggerToast('Action failed: ' + err.message);
    }
  };



  // Authentication Logic
  const handleLogin = async () => {
    const userInp = document.getElementById('loginUser').value.trim();
    const passInp = document.getElementById('loginPass').value.trim();

    // Reference the security library
    const bcryptLib = window.bcrypt || (window.dcodeIO && window.dcodeIO.bcrypt);

    if (!userInp || !passInp) {
      setLoginError("Credentials required");
      return;
    }

    if (!bcryptLib) {
      setLoginError("Security library error");
      return;
    }

    setLoginLoading(true);
    setLoginError("");

    try {
      // Query the 'credentials' table using 'user_id'
      const { data, error } = await supabaseClient
        .from('credentials')
        .select('password, role')
        .eq('user_id', userInp)
        .single();

      if (error || !data) {
        setLoginError("Access Denied: Invalid User");
        return;
      }

      // Compare the raw input against the $2a$12... hash
      const isValid = bcryptLib.compareSync(passInp, data.password);

      if (isValid) {
        // Update React state only (No localStorage)
        setIsLoggedIn(true);

        // If you need the role for UI logic, set it in a React state instead
        // setRole(data.role); 
      } else {
        setLoginError("Access Denied: Invalid Token");
      }
    } catch (err) {

      setLoginError("Secure connection failed");
    } finally {
      setLoginLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-6 z-[9999]">
        <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🔐</div>
            <h2 className="text-2xl font-black text-slate-800">Journal Vault</h2>
            <p className="text-slate-500 text-sm">Enter credentials to unlock</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Username</label>
              <input id="loginUser" type="text" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Password</label>
              <input id="loginPass" type="password" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 transition-colors" />
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 text-rose-600 text-xs font-bold rounded-lg text-center animate-bounce">
                {loginError}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold hover:bg-slate-800 transition-all flex justify-center items-center gap-2"
            >
              {loginLoading ? "Authenticating..." : "Unlock Access"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  //---------- Rendering Starts Here ----------


  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* GLOBAL HEADER */}
      <header className="h-16 bg-white flex items-center justify-between px-6 z-[1001] shrink-0 shadow-sm">
        <div className="flex items-center gap-6">
          <h1 className="text-sm font-black uppercase tracking-tighter text-indigo-900 hidden sm:block">
            My Journal Admin
          </h1>
          <nav className="flex bg-slate-100 p-1 rounded-xl gap-1">
            {['places', 'social', 'map', 'dashboard'].map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-6 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${activeTab === t
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                  }`}
              >
                {/* Optional: Dynamic icon dots for the social tab to make it stand out */}
                {t === 'social' && (
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${activeTab === 'social' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'
                      }`}
                  />
                )}
                {t}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Cleaned: Removed duplicate backgrounds, sticky layers, and padding that clashed with the parent header layout */}
          <div className="flex items-center gap-3">
            {/* 1. Google Maps Search Input */}
            <div className="relative flex items-center">
              <input
                ref={autocompleteRef}
                placeholder="Search Maps"
                className="w-48 sm:w-64 px-4 py-2 bg-slate-100 rounded-xl text-[10px] font-bold uppercase outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* 2. Category & Save Controls (Conditional) */}
            {stagedLocation && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                <select
                  value={stagedLocation.category}
                  onChange={(e) => setStagedLocation({ ...stagedLocation, category: e.target.value })}
                  className="px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl text-[10px] font-black uppercase outline-none cursor-pointer hover:bg-indigo-100 transition-colors"
                >
                  {VALID_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <button
                  onClick={saveStagedLocation}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-200 transition-all active:scale-95"
                >
                  Save
                </button>

                <button
                  onClick={() => {
                    setStagedLocation(null);
                    if (autocompleteRef.current) autocompleteRef.current.value = '';
                  }}
                  className="p-2 bg-slate-100 text-slate-400 hover:text-rose-500 rounded-xl transition-colors"
                  title="Cancel"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-hidden relative">

        {/* TAB 1: PLACES */}
        {activeTab === 'places' && (
          <div className="h-full flex flex-col">
            {/* Filters & Control Header */}
            <div className="px-8 py-4 bg-white border-b border-slate-100 flex flex-wrap items-center gap-4 shrink-0">
              <div className="relative">
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search Location"
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold uppercase outline-none focus:border-indigo-400 transition-all w-48"
                />
              </div>

              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold uppercase outline-none cursor-pointer hover:bg-slate-100">
                <option value="All">All Categories</option>
                {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold uppercase outline-none cursor-pointer hover:bg-slate-100">
                <option value="All">All Status</option>
                <option value="pending">Pending</option>
                <option value="done">Completed</option>
              </select>

              <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold uppercase outline-none cursor-pointer hover:bg-slate-100"
              >
                <option value="newest">Newest First</option>
                <option value="distance">Nearest First</option>
              </select>

              <button
                onClick={() => setLocationSource(prev => prev === 'device' ? 'home' : 'device')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border ${locationSource === 'device'
                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                  : 'bg-amber-50 border-amber-200 text-amber-600'
                  }`}
              >
                <Icon name={locationSource === 'device' ? 'navigation-2' : 'home'} className="w-3.5 h-3.5" />
                {locationSource === 'device' ? 'Live GPS' : 'Home'}
              </button>

              <div className="flex gap-2">
                {/* ⚡ PENDING ARTICLE GENERATOR: Sequences through visited items missing a story map layer */}
                <button
                  onClick={bulkGenerateArticles}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border bg-violet-50 border-violet-200 text-violet-600 hover:bg-violet-100 active:scale-95 shadow-sm"
                  title="Scan for visited locations missing AI stories and batch generate narratives"
                >
                  <Icon name="sparkles" className="w-3.5 h-3.5 text-violet-500" />
                  <span>Articles</span>
                </button>

                {/* METADATA AUDIT TOOL */}
                <button
                  onClick={bulkUpdateMetadata}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100 active:scale-95 shadow-sm"
                >
                  <Icon name="shield-check" className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Audit Meta</span>
                </button>
              </div>

            </div>

            {/* Places Grid */}
            <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {(processedPlaces || []).map(p => {
                  const dynamicDistance = (L.latLng(sortCenter.lat, sortCenter.lng).distanceTo(L.latLng(p.latitude, p.longitude)) / 1000).toFixed(1);
                  const hasArticle = p.ai_article && Object.keys(p.ai_article).length > 0;

                  return (
                    <div key={p.id} className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col group relative hover:shadow-md transition-all">

                      {/* Image Cover Section */}
                      <div className="aspect-video bg-slate-100 relative shrink-0 overflow-hidden">
                        {p.cover_photo_url ? (
                          <img src={p.cover_photo_url} alt="Cover" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                            <Icon name="image" className="w-6 h-6" />
                            <span className="text-[8px] font-black uppercase tracking-widest">No Cover Image</span>
                          </div>
                        )}

                        {/* Top Floating Actions */}
                        <button
                          onClick={() => deleteLocation(p.id, p.place_name)}
                          className="absolute top-2 left-2 p-1.5 bg-white/90 hover:bg-rose-500 hover:text-white text-slate-400 rounded-lg shadow-sm transition-all opacity-0 group-hover:opacity-100 z-10"
                        >
                          <Icon name="trash-2" className="w-3.5 h-3.5" />
                        </button>

                        {/* ACTION 1: MANUAL STATUS TOGGLE SWITCH */}
                        <button
                          onClick={async () => {
                            const updatedStatus = p.status === 'done' ? 'pending' : 'done';

                            // 1. Perform state commit to database first
                            await updatePlaceField(p.id, 'status', updatedStatus);

                            // 2. Trigger matrix exclusively for the 'done' phase
                            if (updatedStatus === 'done') {

                              // Strict Single-Fire IndexNow Logic
                              if (!p.is_indexed) {
                                const indexSuccess = await triggerIndexNow(p.place_name, p.album_photos);

                                // If the serverless proxy successfully logs the link into IndexNow, lock the column
                                if (indexSuccess) {
                                  await updatePlaceField(p.id, 'is_indexed', true);
                                  // Optimistically update local state memory so UI is instantly aware
                                  p.is_indexed = true;
                                }
                              }

                              // Proceed with standard completion broadcast (Now fully guarded against duplicate indexing calls)
                              await notifySubscribersOnCompletion({ ...p, status: 'done' });
                            }
                          }}
                          className={`absolute top-2 right-2 px-3 py-1 rounded-full text-[8px] font-black uppercase shadow-md transition-all active:scale-95 z-10 ${p.status === 'done' ? 'bg-emerald-500 text-white' : 'bg-white/90 text-orange-500'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon name={p.status === 'done' ? 'check-circle' : 'circle'} className="w-2.5 h-2.5" /> {p.status}
                          </div>
                        </button>

                      </div>

                      {/* Body Details */}
                      <div className="p-4 flex-1 flex flex-col gap-3">
                        <input
                          type="text"
                          defaultValue={p.place_name}
                          onBlur={(e) => updatePlaceField(p.id, 'place_name', e.target.value.trim())}
                          className="text-xs font-black uppercase text-slate-800 bg-transparent border-none outline-none focus:bg-slate-50 hover:bg-slate-50 transition-colors rounded px-1 w-full"
                        />

                        <div className="flex flex-col gap-1.5 px-1">
                          <div className="flex items-center gap-1.5">
                            <Icon name="map-pin" className="w-3 h-3 text-slate-400" />
                            <input
                              type="text"
                              defaultValue={p.locality || ''}
                              placeholder="Unknown Locality"
                              onBlur={(e) => updatePlaceField(p.id, 'locality', e.target.value)}
                              className="text-[9px] font-bold text-slate-400 uppercase bg-transparent border-none outline-none focus:bg-slate-50 rounded w-full truncate"
                            />
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Icon name={locationSource === 'device' ? 'navigation-2' : 'home'} className={`w-3 h-3 ${locationSource === 'device' ? 'text-blue-500' : 'text-amber-500'}`} />
                            <span className={`text-[9px] font-black uppercase ${locationSource === 'device' ? 'text-blue-500' : 'text-amber-600'}`}>
                              {dynamicDistance} KM
                            </span>
                          </div>
                        </div>

                        <select
                          value={p.category}
                          onChange={(e) => updatePlaceField(p.id, 'category', e.target.value)}
                          className="text-[9px] font-bold uppercase text-indigo-600 bg-indigo-50 border-none rounded-lg p-2 outline-none cursor-pointer hover:bg-indigo-100 transition-colors w-full"
                        >
                          {VALID_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-50">
                          <div className="flex items-center gap-2">
                            <Icon name="test" className="hidden" /> {/* Keep standard alignment spacing if nested icons vary */}
                            <Icon name="shield" className="w-2.5 h-2.5 text-rose-400" />
                            <select
                              value={p.restriction_level || 'None'}
                              onChange={(e) => updatePlaceField(p.id, 'restriction_level', e.target.value)}
                              className="flex-1 text-[8px] font-black uppercase text-rose-600 bg-rose-50 border-none rounded p-1.5 outline-none hover:bg-rose-100 transition-colors"
                            >
                              <option value="None">No Restriction</option>
                              <option value="Low">Low / General</option>
                              <option value="High">High / Permit</option>
                              <option value="Restricted">No Entry</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <Icon name="landmark" className="w-2.5 h-2.5 text-emerald-400" />
                            <select
                              value={p.governing_org || 'Open'}
                              onChange={(e) => updatePlaceField(p.id, 'governing_org', e.target.value)}
                              className="flex-1 text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 border-none rounded p-1.5 outline-none hover:bg-emerald-100 transition-colors"
                            >
                              <option value="Open">No Authority</option>
                              <option value="Department of Wildlife Conservation">DWC (Wildlife)</option>
                              <option value="Department of Forest Conservation">Forestry Dept</option>
                              <option value="Central Cultural Fund">CCF (Cultural)</option>
                              <option value="Department of Archaeology">Archaeology</option>
                              <option value="Local Authorities">Local Gov (PS)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Action Footer - Organized & Symmetrical */}
                      <div className="p-3 border-t border-slate-50 bg-slate-50/50 flex items-center justify-around">
                        <button
                          onClick={() => promptForValue(p.id, 'cover_photo_url', p.cover_photo_url, 'Cover Image URL')}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white hover:shadow-sm transition-all ${p.cover_photo_url ? 'text-indigo-600' : 'text-slate-300'}`}
                          title="Edit Cover Photo"
                        >
                          <Icon name="camera" className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            const current = Array.isArray(p.album_photos) ? p.album_photos.join(', ') : '';
                            const newVal = prompt("Enter Gallery Image URLs:", current);
                            if (newVal !== null) {
                              const regex = /https:\/\/lh3\.googleusercontent\.com\/pw\/[^"'\s<>]+/g;
                              const extractedLinks = newVal.match(regex);
                              const photoArray = extractedLinks ? [...new Set(extractedLinks)] : newVal.split(',').map(s => s.trim()).filter(s => s !== "");
                              updatePlaceField(p.id, 'album_photos', photoArray);
                            }
                          }}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white hover:shadow-sm transition-all ${p.album_photos?.length > 0 ? 'text-emerald-600' : 'text-slate-300'}`}
                          title="Manage Gallery"
                        >
                          <Icon name="layout-grid" className="w-4 h-4" />
                        </button>

                        {/* ACTION 2: GENERATE TRAVEL ARTICLE TRIGGER MATRIX */}
                        <button
                          onClick={async () => {
                            if (hasArticle) {
                              manualEditArticle(p);
                            } else {
                              // 1. Execute generation script first
                              await generateTravelArticle(p);

                              // 2. Automatically flip location status to done
                              await updatePlaceField(p.id, 'status', 'done');

                              // 3. Strict Single-Fire IndexNow Logic
                              if (!p.is_indexed) {
                                const indexSuccess = await triggerIndexNow(p.place_name, p.album_photos);

                                // If the serverless proxy successfully logs the link into IndexNow, lock the column
                                if (indexSuccess) {
                                  await updatePlaceField(p.id, 'is_indexed', true);
                                  // Optimistically update the local row instance to prevent immediate double clicks
                                  p.is_indexed = true;
                                }
                              }

                              // 4. Proceed with standard completion broadcast (Now fully guarded against duplicate indexing calls)
                              await notifySubscribersOnCompletion({ ...p, status: 'done' });
                            }
                          }}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white hover:shadow-sm transition-all ${hasArticle ? 'text-orange-500' : 'text-slate-300'}`}
                          title={hasArticle ? "Edit Article" : "Generate with AI"}
                        >
                          <Icon name={hasArticle ? "file-text" : "sparkles"} className="w-4 h-4" />
                        </button>


                        {hasArticle && (
                          <button
                            onClick={() => window.confirm(`Delete AI article for ${p.place_name}?`) && updatePlaceField(p.id, 'ai_article', {})}
                            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-rose-50 text-rose-300 hover:text-rose-500 transition-colors"
                            title="Delete AI Article"
                          >
                            <Icon name="file-x" className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>


          </div>
        )}

        {/* TAB 2: SOCIAL (VIGNETTES FEED) */}
        {activeTab === 'social' && (
          <div className="h-full flex flex-col">
            {/* Filters & Control Header */}
            <div className="px-8 py-4 bg-white border-b border-slate-100 flex flex-wrap items-center gap-4 shrink-0">
              <div className="relative">
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search Social Feed"
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold uppercase outline-none focus:border-indigo-400 transition-all w-48"
                />
              </div>

              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold uppercase outline-none cursor-pointer hover:bg-slate-100">
                <option value="All">All Categories</option>
                {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>

              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Verified Feed</span>
              </div>
            </div>

            {/* Social Grid Container */}
            <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-20">
                {processedPlaces
                  .filter((p) => p.status === "done")
                  .map((p) => {
                    // Data extraction from AI Article
                    const hasArticle = p.ai_article && Object.keys(p.ai_article).length > 0;
                    const artisticTitle = `✨ ${p.place_name} — Island Vignettes: A Sri Lankan Journal`;
                    const description =
                      p.ai_article?.story ||
                      "Capturing the essence of Sri Lanka's hidden gems through the lens of adventure.";

                    return (
                      <div
                        key={p.id}
                        className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col group relative hover:shadow-md transition-all"
                      >
                        {/* Image Section */}
                        <div className="aspect-video bg-slate-100 relative shrink-0 overflow-hidden">
                          {p.cover_photo_url ? (
                            <img
                              src={p.cover_photo_url}
                              alt={p.place_name || "Location Visual"}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                              <Icon name="image" className="w-6 h-6" />
                              <span className="text-[8px] font-black uppercase tracking-widest">
                                No Visuals
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Body: Artistic Details */}
                        <div className="p-4 flex-1 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black uppercase text-indigo-500 tracking-widest px-2 py-0.5 bg-indigo-50 rounded-md">
                              {p.category}
                            </span>
                            {hasArticle && (
                              <Icon name="sparkles" className="w-2.5 h-2.5 text-amber-400" />
                            )}
                          </div>

                          <h3 className="text-[11px] font-black uppercase text-slate-800 leading-tight">
                            {artisticTitle}
                          </h3>
                          <p className="text-[10px] font-bold text-slate-400 line-clamp-3 leading-relaxed italic">
                            "{description}"
                          </p>
                        </div>

                        {/* Action Footer: Social Share Buttons (2 Rows x 4 Columns) */}
                        <div className="p-3 border-t border-slate-50 bg-slate-50/50 grid grid-cols-4 gap-1.5">
                          {/* 1. Instagram */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              checkAndPost(p, "instagram", () =>
                                handleMetaShare(p, "instagram", igToken)
                              );
                            }}
                            className={`flex flex-col items-center justify-center gap-1 py-2 text-black border rounded-xl hover:bg-gradient-to-tr hover:from-amber-400 hover:via-rose-500 hover:to-fuchsia-600 hover:text-white transition-all shadow-sm relative ${p.published_instagram_at
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white"
                              }`}
                          >
                            {p.published_instagram_at && (
                              <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                            )}
                            <Icon name="instagram" className="w-3.5 h-3.5" />
                            <span className="text-[7px] font-black uppercase tracking-tighter">
                              Insta
                            </span>
                          </button>

                          {/* 2. Threads */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              checkAndPost(p, "threads", () =>
                                handleMetaShare(p, "threads", threadsToken)
                              );
                            }}
                            className={`flex flex-col items-center justify-center gap-1 py-2 text-black border rounded-xl hover:bg-black hover:text-white transition-all shadow-sm relative ${p.published_threads_at
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white"
                              }`}
                          >
                            {p.published_threads_at && (
                              <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                            )}
                            <Icon name="threads" className="w-3.5 h-3.5" />
                            <span className="text-[7px] font-black uppercase tracking-tighter">
                              Threads
                            </span>
                          </button>

                          {/* 3. Mastodon */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              checkAndPost(p, "mastodon", () => handleMastodonShare(p));
                            }}
                            className={`flex flex-col items-center justify-center gap-1 py-2 text-black border rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm group relative ${p.published_masto_at
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white"
                              }`}
                          >
                            {p.published_masto_at && (
                              <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                            )}
                            <span className="text-sm">🐘</span>
                            <span className="text-[7px] font-black uppercase tracking-tighter">
                              Masto
                            </span>
                          </button>

                          {/* 4. Bluesky */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              checkAndPost(p, "bluesky", () => handleBlueskyShare(p));
                            }}
                            className={`flex flex-col items-center justify-center gap-1 py-2 text-black border rounded-xl hover:bg-[#0085ff] hover:text-white transition-all shadow-sm group relative ${p.published_bsky_at
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white"
                              }`}
                          >
                            {p.published_bsky_at && (
                              <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                            )}
                            <svg
                              className="w-4 h-4 fill-current text-blue-500 group-hover:text-white transition-colors"
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M12,2C9,2 7,4 7,7C7,10 9,12 12,12C15,12 17,10 17,7C17,4 15,2 12,2M12,14C9,14 7,16 7,19C7,22 9,24 12,24C15,24 17,22 17,19C17,16 15,14 12,14Z"
                                transform="rotate(90 12 12)"
                              />
                            </svg>
                            <span className="text-[7px] font-black uppercase tracking-tighter">
                              Bsky
                            </span>
                          </button>

                          {/* 5. Pinterest (Updated to Direct Share) */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              checkAndPost(p, "pinterest", () => handlePinterestShare(p));
                            }}
                            className={`flex flex-col items-center justify-center gap-1 py-2 text-black border rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm group relative ${p.published_pinterest_at
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white"
                              }`}
                          >
                            {p.published_pinterest_at && (
                              <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                            )}
                            <Icon
                              name="heart"
                              className="w-3.5 h-3.5 group-hover:scale-105 transition-transform"
                            />
                            <span className="text-[7px] font-black uppercase tracking-tighter">
                              Pin
                            </span>
                          </button>

                          {/* 6. Flipboard */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              checkAndPost(p, "flipboard", () => handleFlipboardShare(p));
                            }}
                            className={`flex flex-col items-center justify-center gap-1 py-2 text-black border rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm group relative ${p.published_flipboard_at
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white"
                              }`}
                          >
                            {p.published_flipboard_at && (
                              <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                            )}
                            <Icon
                              name="refresh-cw"
                              className="w-3.5 h-3.5 group-hover:scale-105 transition-transform"
                            />
                            <span className="text-[7px] font-black uppercase tracking-tighter">
                              Flip
                            </span>
                          </button>

                          {/* 7. Unsplash */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleUnsplashExport(p);
                            }}
                            title={p?.published_unplash_at ? "Exported to Unsplash" : "Export to Unsplash"}
                            className={`flex flex-col items-center justify-center gap-1 py-2 text-black border rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm group relative ${p?.published_unplash_at
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white"
                              }`}
                          >
                            {p?.published_unplash_at && (
                              <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                            )}
                            <svg
                              className="w-3.5 h-3.5 fill-current text-zinc-800 group-hover:text-white transition-colors"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 9c1.657 0 3 1.343 3 3s-1.343 3-3 3-3-1.343-3-3 1.343-3 3-3zm9-2h-2.586l-1.707-1.707A.996.996 0 0 0 16 5h-8a.996.996 0 0 0-.707.293L5.586 7H3c-1.103 0-2 .897-2 2v11c0 1.103.897 2 2 2h18c1.103 0 2-.897 2-2V9c0-1.103-.897-2-2-2zM12 17c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z" />
                            </svg>
                            <span className="text-[7px] font-black uppercase tracking-tighter">
                              Unsplash
                            </span>
                          </button>

                          {/* 8. Twitter (X) */}
                          <button
                            type="button"
                            onClick={(e) => handleTwitterPush(p, e)}
                            className={`flex flex-col items-center justify-center gap-1 py-2 text-black border rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm group relative ${p.published_twitter_at
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white"
                              }`}
                          >
                            {p.published_twitter_at && (
                              <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                            )}
                            <Icon
                              name="twitter"
                              className="w-3.5 h-3.5 text-sky-500 group-hover:text-white transition-colors"
                            />
                            <span className="text-[7px] font-black uppercase tracking-tighter">
                              X / Twt
                            </span>
                          </button>

                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}


        {/* TAB 3: MAP */}
        <div className={`flex h-full w-full ${activeTab === 'map' ? 'flex' : 'hidden'} flex-col md:flex-row overflow-hidden`}>

          {/* MAP CONTAINER - Top on Mobile (40%), Right on Desktop */}
          <section className="w-full flex-[0.4] md:flex-1 relative bg-slate-100 order-1 md:order-2 min-h-[300px]">
            <div id="map-container" className="w-full h-full"></div>
          </section>

          {/* SIDEBAR / BOTTOM PANEL - Fixed Container with 3 Vertically Split Scrollable Sections */}
          <aside className="w-full flex-[0.6] md:w-96 md:flex-none border-t md:border-t-0 md:border-r border-slate-200 bg-slate-100/60 p-2 flex flex-col gap-2 overflow-hidden shadow-2xl z-[1000] order-2 md:order-1 h-full">

            {/* =================================================================== */}
            {/* 1. ACTIVE TRIP PLANNER & ACTION TOOLBAR (1/4 Height)                */}
            {/* =================================================================== */}
            <div className="h-1/4 flex flex-col bg-slate-50 rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">

              {/* Header & Control Actions */}
              <div className="p-3 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between shrink-0 gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 truncate">
                    <span>Active Trip ({selectedTrip.length})</span>
                    {activeRouteName && (
                      <span className="text-amber-600 font-bold normal-case truncate">
                        — {activeRouteName}
                      </span>
                    )}
                  </p>
                  {typeof calculateRouteDistance === 'function' && (
                    <p className="text-[10px] text-slate-500 font-semibold">
                      Est: {calculateRouteDistance()} km
                    </p>
                  )}
                </div>

                {/* Active Route Toolbar */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* SAVE ROUTE BUTTON */}
                  <button
                    onClick={handleSaveRoute}
                    disabled={selectedTrip.length === 0}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-[9px] font-black uppercase transition-all shadow-sm"
                    title="Save Active Route"
                  >
                    <Icon name="save" className="w-3 h-3" />
                    Save
                  </button>

                  {/* SHARE VIA WHATSAPP */}
                  {typeof handleWhatsAppShare === 'function' && (
                    <button
                      onClick={handleWhatsAppShare}
                      disabled={selectedTrip.length === 0}
                      className="p-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg transition-all"
                      title="Share via WhatsApp"
                    >
                      <Icon name="message-square" className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* QR CODE */}
                  {typeof handleShowQR === 'function' && (
                    <button
                      onClick={handleShowQR}
                      disabled={selectedTrip.length === 0}
                      className="p-1 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white rounded-lg transition-all"
                      title="Show QR Code"
                    >
                      <Icon name="navigation-2" className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* CLEAR TRIP */}
                  <button
                    onClick={() => {
                      setSelectedTrip([]);
                      setActiveRouteName('');
                      if (routingControl?.current && mapRef?.current) {
                        mapRef.current.removeControl(routingControl.current);
                      }
                      triggerToast('Route Cleared');
                    }}
                    disabled={selectedTrip.length === 0}
                    className="p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-40 rounded-lg transition-all"
                    title="Clear Route"
                  >
                    <Icon name="trash-2" className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Active Trip Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="trip-planner-list">
                    {(provided) => (
                      <ul
                        className="space-y-2 pr-1 min-h-full"
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        {selectedTrip.map((stop, index) => {
                          const placeNameKey = stop.place_name || stop.n;
                          const weather = weatherData[placeNameKey];

                          return (
                            <Draggable
                              key={stop.id || `stop-${index}`}
                              draggableId={String(stop.id || `stop-${index}`)}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <li
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`flex flex-col gap-2 p-2 bg-white border rounded-xl transition-shadow ${snapshot.isDragging
                                    ? 'shadow-lg border-indigo-300 z-50'
                                    : 'shadow-sm border-slate-200/80'
                                    }`}
                                >
                                  {/* Top Row: Handle, Index, Waypoint Name, Delete */}
                                  <div className="flex items-center gap-2">
                                    {/* Drag Handle Icon */}
                                    <div className="text-slate-400 cursor-grab active:cursor-grabbing">
                                      <Icon name="layout-grid" className="w-3.5 h-3.5" />
                                    </div>

                                    {/* Waypoint Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-900 text-white text-[8px] font-black shrink-0">
                                          {index + 1}
                                        </span>
                                        <p className="text-[10px] font-black uppercase text-slate-800 truncate">
                                          {placeNameKey}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Remove Waypoint Button */}
                                    <button
                                      onClick={() => setSelectedTrip((prev) => prev.filter((p) => p.id !== stop.id))}
                                      className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    >
                                      <Icon name="trash-2" className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* Weather Status Integration */}
                                  {weather ? (
                                    <div className="flex items-center gap-3 px-6 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                                      {/* Current Weather */}
                                      <div className="flex items-center gap-1.5">
                                        <WeatherIcon condition={weather.currentCond} />
                                        <div className="flex flex-col">
                                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Current</span>
                                          <span className="text-xs font-black text-slate-700">{weather.current}°C</span>
                                        </div>
                                      </div>

                                      <div className="w-px h-6 bg-slate-200"></div>

                                      {/* Next Day Weather */}
                                      <div className="flex items-center gap-1.5">
                                        <WeatherIcon condition={weather.nextCond} />
                                        <div className="flex flex-col">
                                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Next Day</span>
                                          <span className="text-xs font-black text-slate-700">{weather.nextDay}°C</span>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="px-6 py-1 text-[9px] text-slate-400 italic animate-pulse">
                                      Loading weather...
                                    </div>
                                  )}
                                </li>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </ul>
                    )}
                  </Droppable>
                </DragDropContext>

                {selectedTrip.length === 0 && (
                  <div className="h-full py-4 flex flex-col items-center justify-center text-slate-400 space-y-1 border border-dashed border-slate-200 rounded-xl bg-white/50">
                    <Icon name="map-pin" className="w-5 h-5 text-slate-300" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Route is empty</p>
                  </div>
                )}
              </div>
            </div>


            {/* =================================================================== */}
            {/* 2. SAVED ROUTE PLANS SECTION (1/3 Height)                            */}
            {/* =================================================================== */}
            <div className="h-1/3 flex flex-col bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">
              <div className="p-3 bg-white border-b border-slate-100 shrink-0 flex justify-between items-center">
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                  Saved Route Plans ({savedRoutes.length})
                </p>
              </div>

              {/* Saved Routes Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                <DragDropContext onDragEnd={handleSavedRoutesDragEnd}>
                  <Droppable droppableId="saved-routes-list">
                    {(provided) => (
                      <div
                        className="space-y-2 pr-1 min-h-full"
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        {savedRoutes.length === 0 ? (
                          <p className="text-[10px] text-slate-300 italic py-6 text-center border border-dashed border-slate-200 rounded-xl uppercase font-bold">
                            No saved routes
                          </p>
                        ) : (
                          savedRoutes.map((route, index) => {
                            let wpArray = [];
                            try {
                              wpArray = typeof route.waypoints === 'string' ? JSON.parse(route.waypoints) : (route.waypoints || []);
                            } catch (e) {
                              wpArray = [];
                            }

                            return (
                              <Draggable
                                key={route.id}
                                draggableId={String(route.id)}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={`p-2.5 bg-slate-50/80 border rounded-xl shadow-sm hover:border-indigo-200 transition-all group ${snapshot.isDragging ? 'shadow-lg border-indigo-300 bg-white z-50' : 'border-slate-100'
                                      }`}
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                        {/* Drag Handle Icon */}
                                        <div
                                          {...provided.dragHandleProps}
                                          className="text-slate-400 cursor-grab active:cursor-grabbing hover:text-slate-600 transition-colors shrink-0"
                                          title="Drag to reorder route plan"
                                        >
                                          <Icon name="layout-grid" className="w-3.5 h-3.5" />
                                        </div>
                                        <p className="text-[10px] font-black uppercase text-slate-700 group-hover:text-indigo-600 truncate">
                                          {route.route_name}
                                        </p>
                                      </div>
                                      <span className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase shrink-0">
                                        {wpArray.length} Stop{wpArray.length === 1 ? '' : 's'}
                                      </span>
                                    </div>

                                    <div className="flex gap-1.5">
                                      {/* LOAD ROUTE */}
                                      <button
                                        onClick={() => handleLoadRoute(route)}
                                        className="flex-1 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-black uppercase border border-indigo-100 hover:bg-indigo-100 transition-colors"
                                      >
                                        Load
                                      </button>

                                      {/* SHARE ROUTE */}
                                      <button
                                        onClick={() => shareRoute(route)}
                                        className="flex-1 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-black uppercase border border-emerald-100 hover:bg-emerald-100 transition-colors"
                                      >
                                        Share
                                      </button>

                                      {/* DELETE ROUTE */}
                                      <button
                                        onClick={() => deleteRoute(route.id)}
                                        className="py-1 px-2 bg-rose-50 text-rose-600 rounded-lg text-[8px] font-black uppercase border border-rose-100 hover:bg-rose-100 transition-colors"
                                        title="Delete Route"
                                      >
                                        <Icon name="trash-2" className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>
            </div>


            {/* =================================================================== */}
            {/* 3. AVAILABLE LOCATIONS SECTION (1/3 Height)                        */}
            {/* =================================================================== */}
            <div className="h-1/3 flex flex-col bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">
              <div className="p-3 bg-white border-b border-slate-100 shrink-0 space-y-2">
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Available Locations</p>
                <input
                  type="text"
                  placeholder="Search locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-bold uppercase outline-none focus:border-indigo-400 transition-all"
                />
              </div>

              {/* Available Locations Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                {processedPlaces
                  .filter(p => !selectedTrip.find(t => t.id === p.id))
                  .map(p => {
                    const d = HomePoint ? L.latLng(HomePoint.lat, HomePoint.lng).distanceTo(L.latLng(p.latitude, p.longitude)) : 0;
                    const km = (d / 1000).toFixed(1);
                    const isDone = p.status === 'done';

                    // Check if location is part of any saved route plan
                    const matchingRoute = savedRoutes.find(route => {
                      let wpArray = [];
                      try {
                        wpArray = typeof route.waypoints === 'string' ? JSON.parse(route.waypoints) : (route.waypoints || []);
                      } catch (e) {
                        wpArray = [];
                      }
                      return wpArray.some(wp =>
                        wp.id === p.id ||
                        (wp.place_name && wp.place_name === p.place_name) ||
                        (wp.n && wp.n === p.place_name)
                      );
                    });

                    const reservedRouteName = matchingRoute ? matchingRoute.route_name : null;
                    const isReserved = !!reservedRouteName;

                    return (
                      <div key={p.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-100 group">
                        <div className="flex flex-col truncate pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase truncate text-slate-600 group-hover:text-slate-900">
                              {p.place_name}
                            </span>

                            {/* DYNAMIC STATUS TAG */}
                            <div className={`flex items-center gap-1 px-1 py-0.5 rounded-md border ${isReserved
                              ? 'bg-purple-50 border-purple-100 text-purple-600'
                              : isDone
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                : 'bg-orange-50 border-orange-100 text-orange-600'
                              }`}>
                              <div className={`w-1 h-1 rounded-full ${isReserved
                                ? 'bg-purple-500'
                                : isDone
                                  ? 'bg-emerald-500'
                                  : 'bg-orange-400 animate-pulse'
                                }`}></div>
                              <span className="text-[8px] font-black uppercase tracking-tighter">
                                {isReserved ? 'Reserved' : isDone ? 'Done' : 'Pending'}
                              </span>
                            </div>
                          </div>

                          {/* DISTANCE & ROUTE PLAN ASSOCIATION */}
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-[9px] font-bold uppercase text-slate-400 tracking-tight shrink-0">
                              {km} KM
                            </span>
                            {isReserved && (
                              <span className="text-[8px] font-black uppercase text-purple-500 tracking-tight truncate italic">
                                • Plan: {reservedRouteName}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            const updatedTrip = [...selectedTrip, p];
                            setSelectedTrip(updatedTrip);
                            if (typeof fetchRouteWeather === 'function') fetchRouteWeather(updatedTrip);
                            triggerToast(`Added ${p.place_name}`);
                          }}
                          className="text-emerald-500 hover:bg-emerald-50 p-1.5 rounded-lg active:scale-90 transition-transform shrink-0"
                          title="Add to Active Route"
                        >
                          <Icon name="plus-circle" className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>

          </aside>
        </div>

        {/* TAB 4: DASHBOARD */}

        {activeTab === 'dashboard' && (
          <div className="h-full w-full overflow-y-auto p-8 no-scrollbar bg-slate-50">

            {/* HEADER */}
            <div className="max-w-full mx-auto mb-8 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">System Overview</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time journal analytics</p>
              </div>
              
            </div>

            <div className="max-w-full mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">

              {/* 1. PAGE VISITS BLOCK (TRAFFIC INTELLIGENCE) */}
<div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden lg:col-span-2">
  <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500 rounded-full blur-3xl opacity-20" />

  {/* Header Logic: Deriving totals from breakdown to ensure sync */}
  {(() => {
    const trafficEntries = dashboardStats.trafficType || [];
    const realCount = trafficEntries.find(([type]) => type === 'Real Person')?.[1] || 0;

    // Summing all types ensures the total matches the breakdown exactly
    const calculatedTotal = trafficEntries.reduce((acc, [_, count]) => acc + count, 0);

    const verifiedPercentage = calculatedTotal > 0
      ? Math.min(Math.round((realCount / calculatedTotal) * 100), 100)
      : 0;

    return (
      <div className="flex justify-between items-start mb-10 relative z-10">
  <div>
    <p className="text-[10px] font-black uppercase text-indigo-400 mb-1 tracking-widest">
      Traffic Intelligence
    </p>
    <p className="text-6xl font-black italic tracking-tighter">
      {calculatedTotal}
    </p>
  </div>

  <div className="text-right flex flex-col items-end gap-2">
    {/* Container grouping Badge, Refresh button, and Delete button */}
    <div className="flex items-center gap-2">
      
      {/* 1. Human Verification Badge */}
      <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
        <RefreshProgressCircle 
          timeLeft={timeLeft} 
          totalTime={REFRESH_INTERVAL_SECONDS} 
        />
        <span className="text-emerald-400 font-black italic text-sm">
          {verifiedPercentage}%
        </span>
        <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">
          Verified Person
        </span>
      </div>

      {/* 2. Refresh Button (Middle - Styled to match badge/delete button) */}
      <button
        onClick={handleManualRefresh || refreshAllData}
        title="Refresh data"
        className="flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 p-2 rounded-full transition-all duration-150 active:scale-95 group"
      >
        <Icon name="refresh-cw" className="w-3.5 h-3.5 text-indigo-400 group-active:animate-spin" />
      </button>

      {/* 3. Icon-Only Delete Button */}
      <button
        onClick={handleClearDashboardData}
        title="Clear all page visits history"
        className="flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 p-2 rounded-full transition-all duration-150 active:scale-95"
      >
        <Icon name="trash-2" className="w-3.5 h-3.5 text-rose-400" />
      </button>
      
    </div>
  </div>
</div>
    );
  })()}

  {/* Metrics Grid */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 relative z-10">
    <MetricColumn
      title="Countries"
      data={dashboardStats.countries}
      highlightValue={dashboardStats.latest?.country}
    />
    <MetricColumn
      title="Regions"
      data={dashboardStats.regions}
      highlightValue={dashboardStats.latest?.region}
    />
    <MetricColumn
      title="Cities"
      data={dashboardStats.cities}
      highlightValue={dashboardStats.latest?.city}
    />
    <MetricColumn
      title="Device Type"
      data={dashboardStats.deviceTypes}
      highlightValue={dashboardStats.latest?.type}
    />
    <MetricColumn
      title="Operating System"
      data={dashboardStats.os}
      highlightValue={dashboardStats.latest?.os}
    />
    <MetricColumn
      title="App / Source"
      data={dashboardStats.sources}
      highlightValue={dashboardStats.latest?.source}
    />
    <MetricColumn
      title="Visit Loyalty"
      data={dashboardStats.loyalty}
      highlightValue={dashboardStats.latest?.loyaltyStatus}
    />
    <MetricColumn
      title="Visit History"
      data={dashboardStats.pageHistory}
      highlightValue={dashboardStats.latest?.normalizedPagePath}
    />

    {/* Traffic Type Breakdown */}
    <div>
      <p className="text-[9px] font-black uppercase text-slate-500 mb-3 border-b border-slate-700 pb-1 tracking-wider">
        Traffic Type
      </p>
      <div className="space-y-2">
        {(dashboardStats.trafficType || []).map(([type, count]) => {
          // Matches 'Real Person' or Bot categories with the latest log state
          const isLatestTraffic =
            dashboardStats.latest &&
            ((dashboardStats.latest.isBot && type !== 'Real Person') ||
              (!dashboardStats.latest.isBot && type === 'Real Person'));

          return (
            <div
              key={type}
              className="flex justify-between items-center text-[10px] font-bold"
            >
              <span
                className={
                  type === 'Real Person' ? 'text-emerald-400' : 'text-rose-400'
                }
              >
                {type}
              </span>
              <span
                className={
                  isLatestTraffic
                    ? 'text-orange-400 font-black'
                    : 'text-white font-black'
                }
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  </div>
</div>

              {/* 2. LIKES METRICS*/}

              <div className="bg-rose-500 rounded-[2.5rem] p-8 text-white shadow-xl flex flex-col h-[450px]">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-[10px] font-black uppercase text-pink-900 mb-1 tracking-widest">Popular Locations</p>
                    <p className="text-4xl font-black italic tracking-tighter">
                      {dashboardStats.likesSummary.reduce((a, b) => a + b.hits, 0)}
                      <span className="text-sm opacity-60 ml-2 font-bold uppercase tracking-widest">Likes</span>
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                    <Icon name="heart" className="w-6 h-6 fill-white text-white lucide" />
                  </div>
                </div>

                {/* Inner List - Matched to Block 2's dark transparent style */}
                <div className="bg-white/10 rounded-[2rem] p-5 flex-1 flex flex-col min-h-0 border border-white/5">
                  <div className="overflow-y-auto custom-scrollbar pr-2 flex-1 space-y-1">
                    {dashboardStats.likesSummary.map((item, i) => {
                      const isExpanded = expandedLikeLoc === item.name;

                      return (
                        <div
                          key={i}
                          className="flex flex-col border-b border-white/10 last:border-0 group cursor-pointer transition-colors hover:bg-white/5 rounded-xl px-2 -mx-2"
                          onClick={() => setExpandedLikeLoc(isExpanded ? null : item.name)}
                        >
                          <div className="flex justify-between items-center py-3">
                            <div className="flex flex-col truncate pr-4">
                              <p className="text-[11px] font-black uppercase truncate text-white group-hover:text-rose-200 transition-colors">
                                {item.name}
                              </p>
                              <p className="text-[8px] font-bold text-white/50 uppercase tracking-widest">
                                {item.category}
                              </p>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2">
                              <p className="text-sm font-black tracking-tighter text-white">{item.hits}</p>
                              {/* Small indicator arrow */}
                              <Icon
                                name="navigation"
                                className={`w-3 h-3 text-white/30 transition-transform ${isExpanded ? 'rotate-180' : 'rotate-90'}`}
                              />
                            </div>
                          </div>

                          {/* Expanded Country Breakdown */}
                          {isExpanded && (
                            <div className="pb-3 animate-in fade-in slide-in-from-top-2">
                              <div className="bg-black/20 rounded-xl p-3 space-y-2 border border-white/5 shadow-inner">
                                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2 border-b border-white/10 pb-1">
                                  Country Breakdown
                                </p>
                                <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                  {Object.entries(item.countries)
                                    .sort((a, b) => b[1] - a[1]) // Sort highest to lowest
                                    .map(([country, count]) => (
                                      <div key={country} className="flex justify-between items-center">
                                        <span className="text-[9px] font-bold text-white/80">{country}</span>
                                        <span className="text-[9px] font-black text-rose-300">{count}</span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 3. NEWSLETTER SUBSCRIBERS */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col h-[450px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-[10px] font-black uppercase text-indigo-600 flex items-center gap-2 tracking-widest">
                    <Icon name="mail" className="w-4 h-4 lucide" /> Subscribers
                  </h2>
                  {/* Corrected to ensure safe access and accurate length calculation */}
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-tighter border border-indigo-100">
                    {(subscribersData || []).length} Total
                  </span>
                </div>

                <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 pr-2 min-h-0">
                  {(subscribersData || []).map(sub => (
                    <div key={sub.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-slate-50 transition-all">
                      <div className="flex flex-col truncate pr-4">
                        <p className="text-[10px] font-black text-slate-800 truncate">{sub.email}</p>
                        <p className="text-[8px] font-bold text-slate-400 mt-0.5 tracking-widest uppercase">
                          {/* Using subscribed_at as the primary date source */}
                          {new Date(sub.subscribed_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center shrink-0">
                        {/* Clickable interactive status toggle */}
                        <button
                          onClick={() => toggleSubscriberStatus(sub.id, sub.is_active)}
                          title={`Click to mark as ${sub.is_active === true ? 'Inactive' : 'Active'}`}
                          className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all transform active:scale-95 hover:scale-105 ${sub.is_active === true
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 group-hover:shadow-sm'
                            : 'bg-rose-100 text-rose-700 border border-rose-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 group-hover:shadow-sm'
                            }`}
                        >
                          {sub.is_active === true ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    </div>
                  ))}

                  {(!subscribersData || subscribersData.length === 0) && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                      <Icon name="mail" className="w-10 h-10 mb-2 lucide" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-center">No Subscribers Yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. PENDING COMMENTS */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col h-[450px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-[10px] font-black uppercase text-slate-800 flex items-center gap-2 tracking-widest">
                    <Icon name="message-square" className="w-4 h-4 lucide text-indigo-500" /> Pending Comments
                  </h2>
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-tighter">
                    {allComments.filter(c => !c.reply_text).length} New
                  </span>
                </div>
                <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2 min-h-0">
                  {allComments.filter(c => !c.reply_text).map(c => (
                    <div key={c.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-[9px] font-black uppercase text-indigo-500 truncate">
                          {c.travel_bucket_list?.place_name || 'General Entry'}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">
                          {new Date(c.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-xs text-slate-700 font-medium italic mb-3">"{c.comment_text}"</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input
                            id={`reply-input-${c.id}`}
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] outline-none focus:ring-1 focus:ring-indigo-400 placeholder:uppercase placeholder:text-[8px] placeholder:font-bold"
                            placeholder="Type reply..."
                          />
                          <button
                            onClick={() => submitCommentReply(c.id, `reply-input-${c.id}`)}
                            className="px-4 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase transition-all hover:bg-indigo-700 active:scale-95 shadow-lg shadow-indigo-100"
                          >
                            Reply
                          </button>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => deleteLocationComment(c.id)}
                            className="text-[8px] font-black uppercase text-rose-400 hover:text-rose-600 transition-colors"
                          >
                            Delete Thread
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {allComments.filter(c => !c.reply_text).length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                      <Icon name="check-circle" className="w-10 h-10 mb-2 lucide" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-center">Inbox Cleared</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. SUGGESTIONS */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col h-[450px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-[10px] font-black uppercase text-orange-600 flex items-center gap-2 tracking-widest">
                    <Icon name="shield-alert" className="w-4 h-4 lucide" /> Suggestions
                  </h2>
                  <span className="px-3 py-1 bg-orange-100 text-orange-600 rounded-full text-[9px] font-black uppercase tracking-tighter">
                    {pendingApprovals.length} Pending
                  </span>
                </div>
                <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 pr-2 min-h-0">
                  {pendingApprovals.map(a => (
                    <div key={a.id} className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 flex justify-between items-center group hover:bg-orange-50 transition-all">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-800">{a.place_name}</p>
                        <p className="text-[8px] font-bold text-slate-500 mt-0.5 tracking-widest uppercase">{a.category || 'New Location'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSuggestionAction(a.id, 'approved')} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[8px] font-black uppercase shadow-lg shadow-emerald-100 hover:scale-105 transition-transform">Approve</button>
                        <button onClick={() => handleSuggestionAction(a.id, 'rejected')} className="px-3 py-1.5 bg-rose-100 text-rose-600 rounded-lg text-[8px] font-black uppercase hover:bg-rose-200">Dismiss</button>
                      </div>
                    </div>
                  ))}
                  {pendingApprovals.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                      <Icon name="activity" className="w-10 h-10 mb-2 lucide" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-center">No Pending Audits</p>
                    </div>
                  )}
                </div>
              </div>



            </div>
          </div>
        )}
      </main>

      {/* TOAST */}
      {toast.show && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[5000] bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase shadow-2xl transition-all">
          {toast.msg}
        </div>
      )}
    </div>
  );

  //---------- Rendering Ends Here ----------


}

export default App;