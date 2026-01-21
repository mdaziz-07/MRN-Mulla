import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { db } from './firebase';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { collection, addDoc, onSnapshot, updateDoc, doc, deleteDoc, query, orderBy, serverTimestamp, writeBatch, where, getDocs, limit, setDoc } from 'firebase/firestore';
import { ShoppingCart, MapPin, Plus, Check, Truck, Bell, Menu, X, Trash2, BarChart3, Calendar, Package, Search, ChevronRight, Minus, Edit2, Save, DownloadCloud, Eye, Filter, User, Crosshair, PhoneCall, Volume2, Info, RefreshCw, Lock, LogOut, Mic, CreditCard, Banknote, ChevronDown } from 'lucide-react';

// --- FREE MAP LIBRARY ---
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// --- CONFIGURATION ---
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1461959463559889039/vbAvNso8Z9yqfbiksx5eyVVnJpvTSbnQTnbL30mrzNydB316jX5T1w3EdukkLaV4W7tR"; 
const RAZORPAY_KEY_ID = "rzp_test_S5PRN3SjWllRi3"; 
const DEFAULT_MAP_CENTER = [16.5417, 76.9715]; 

// --- HELPER: Send Discord Alert ---
const sendDiscordAlert = async (orderData) => {
  const itemsList = orderData.items.map(i => `• ${i.qty}x ${i.name} (${i.packSize || ''}${i.unit || ''})`).join('\n');
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: "@everyone 🚨 **NEW ORDER!**",
        embeds: [{
          title: `Amount: ₹${orderData.total}`,
          description: `**Customer:** ${orderData.customerName}\n**Mobile:** ${orderData.mobile}\n**Address:** ${orderData.address}`,
          color: 5763719,
          fields: [{ name: "Items", value: itemsList.substring(0, 1024) }, { name: "Payment", value: orderData.paymentMethod, inline: true }],
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (error) {}
};

// --- HELPER: Load Razorpay Script ---
const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

// --- HELPER: Voice Alert ---
const speakOrderAlert = () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance("Order! Order! New Order Received.");
        utterance.rate = 1.1; 
        window.speechSynthesis.speak(utterance);
    }
};

// --- MAP COMPONENTS ---
function LocationMarker({ location, setLocation }) {
  const map = useMapEvents({
    click(e) {
      setLocation({ lat: e.latlng.lat, long: e.latlng.lng });
      map.flyTo(e.latlng, map.getZoom());
    },
  });
  return location ? <Marker position={[location.lat, location.long]} /> : null;
}

// AUTO-REDIRECT TO GPS LOCATION
function RecenterAutomatically({ location }) {
  const map = useMap();
  useEffect(() => {
    if (location) {
      map.setView([location.lat, location.long], 16, { animate: true });
    }
  }, [location, map]);
  return null;
}

// --- ADMIN ROUTE ---
function AdminRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const auth = getAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) { navigate('/'); return; }
    return onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
  }, [navigate]);

  const login = async (e) => { 
      e.preventDefault(); 
      if (Notification.permission !== "granted") Notification.requestPermission();
      try { await signInWithEmailAndPassword(auth, email, password); } catch { alert("Login failed"); } 
  };

  if (!Capacitor.isNativePlatform()) return null;
  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-green-700">Verifying...</div>;

  if (!user) {
    return (
      <div className="h-screen bg-green-800 flex items-center justify-center p-6">
        <form onSubmit={login} className="bg-white p-8 rounded-2xl w-full max-w-sm shadow-2xl">
           <div className="flex justify-center mb-4"><div className="bg-green-100 p-4 rounded-full text-green-700"><Lock size={32}/></div></div>
           <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Admin Access</h2>
           <input placeholder="Admin Email" className="w-full p-3 border rounded-lg mb-3" onChange={e=>setEmail(e.target.value)} />
           <input type="password" placeholder="Password" className="w-full p-3 border rounded-lg mb-6" onChange={e=>setPassword(e.target.value)} />
           <button className="w-full bg-green-700 text-white py-3 rounded-lg font-bold shadow-lg">Unlock Panel</button>
        </form>
      </div>
    );
  }
  return children;
}

// --- ADMIN PANEL ---
function AdminPanel() {
  const [productForm, setProductForm] = useState({ name: '', price: '', costPrice: '', category: '', packSize: '', unit: 'pkt', stock: '', imageUrl: '' });
  const [isEditing, setIsEditing] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [existingCategories, setExistingCategories] = useState([]);
  const [activeTab, setActiveTab] = useState('orders');
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [dateRange, setDateRange] = useState('7'); 
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showNotification, setShowNotification] = useState(false); 
   
  const isFirstRun = useRef(true);

  useEffect(() => {
    // 1. ORDERS LISTENER (With Native Change Detection)
    const qOrders = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(20));
    
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const newOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (isFirstRun.current) {
          isFirstRun.current = false;
          setOrders(newOrders);
          return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            speakOrderAlert();
            setShowNotification(true);
            if (Notification.permission === "granted") new Notification("New Order Received!");
            setTimeout(() => setShowNotification(false), 5000);
        }
      });

      if (dateRange === '7' && !isLoading) setOrders(newOrders);
    });

    const qProd = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubProd = onSnapshot(qProd, (snapshot) => {
       const prods = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
       setProducts(prods);
       const cats = new Set(prods.map(p => p.category).filter(Boolean));
       setExistingCategories(Array.from(cats).sort());
    });
    return () => { unsubOrders(); unsubProd(); };
  }, []);

  const handleLoadData = async () => {
      setIsLoading(true);
      let q;
      const now = new Date();
      if (dateRange === 'custom' && customStart && customEnd) {
          const start = new Date(customStart); start.setHours(0,0,0,0);
          const end = new Date(customEnd); end.setHours(23,59,59,999);
          q = query(collection(db, "orders"), where("timestamp", ">=", start), where("timestamp", "<=", end), orderBy("timestamp", "desc"));
      } else if (dateRange === 'all') {
          q = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(100));
      } else {
          const days = Number(dateRange);
          const cutoff = new Date(now.setDate(now.getDate() - days));
          q = query(collection(db, "orders"), where("timestamp", ">=", cutoff), orderBy("timestamp", "desc"));
      }
      const snapshot = await getDocs(q);
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!productForm.name || !productForm.price || !productForm.category) return alert("Fill Name, Price & Category");
    if (productForm.imageUrl && (productForm.imageUrl.includes("google.com/search") || productForm.imageUrl.includes("share.google"))) return alert("❌ Invalid Image Link.");

    const docId = isEditing || productForm.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const payload = { ...productForm, price: Number(productForm.price), costPrice: Number(productForm.costPrice) || Number(productForm.price) * 0.8, stock: Number(productForm.stock) || 0, createdAt: serverTimestamp() };

    await setDoc(doc(db, "products", docId), payload);
    alert(isEditing ? "Updated!" : "Added!");
    setProductForm({ name: '', price: '', costPrice: '', category: '', packSize: '', unit: 'pkt', stock: '', imageUrl: '' });
    setShowAddModal(false); setIsEditing(null);
  };

  const bulkImport = async () => {
    if(!confirm("Import Kiko Store Items?")) return;
    const batch = writeBatch(db);
    const items = [
      { n: "Rupani's Ginger & Garlic Paste", p: 5, c: "Spices", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/51+uL9tXbBL._AC_UF1000,1000_QL80_.jpg" },
      { n: "EVEREST PASTA MASALA", p: 5, c: "Spices", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/61y8q2-o6eL.jpg" },
      { n: "BOOST", p: 5, c: "Beverages", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/61lXG-1+FBL.jpg" },
      { n: "Fevikwik", p: 5, c: "Household", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/61-2-V+9+2L.jpg" },
      { n: "Boroplus Ayurvedic", p: 5, c: "Personal Care", s: "5", u: "ML", img: "https://m.media-amazon.com/images/I/51p+yX-6+ZL.jpg" },
      { n: "Sunfeast YiPPee! Noodles", p: 5, c: "Snacks", s: "30", u: "GRAMS", img: "https://m.media-amazon.com/images/I/81tic-3kZ-L.jpg" },
      { n: "Maggi Masala Magic", p: 5, c: "Spices", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/81D+621wQZL.jpg" },
      { n: "Nataraj Be Bold Pencils", p: 5, c: "Stationery", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/71J1kC-x0pL.jpg" },
      { n: "Dynobite", p: 5, c: "Snacks", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/61N+C+5+uZL.jpg" },
      { n: "Dove Conditioner", p: 5, c: "Personal Care", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/51wXpMv-wGL.jpg" },
      { n: "Steel Safety Pins", p: 5, c: "Household", s: "1", u: "UNIT", img: "https://m.media-amazon.com/images/I/61zC+p-p+ZL.jpg" },
      { n: "Ponds Cold Cream", p: 5, c: "Personal Care", s: "6", u: "ML", img: "https://m.media-amazon.com/images/I/51b1fWl0cCL.jpg" }
    ];
    items.forEach(i => {
        const id = i.n.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const ref = doc(db, "products", id);
        batch.set(ref, { name: i.n, price: i.p, costPrice: i.p * 0.8, category: i.c, packSize: i.s, unit: i.u, stock: 20, imageUrl: i.img, createdAt: serverTimestamp() });
    });
    await batch.commit();
    alert("Products Imported!");
  };

  const formatDate = (ts) => ts ? new Date(ts.seconds * 1000).toLocaleDateString('en-GB') : "";
  const validOrders = orders.filter(o => o.status !== 'Cancelled');
  const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);
  const totalProfit = validOrders.reduce((sum, o) => sum + (o.total - o.items.reduce((c, i) => c + ((i.costPrice || i.price * 0.8) * i.qty), 0)), 0);

  const enableVoice = () => { const msg = new SpeechSynthesisUtterance("Voice Enabled"); window.speechSynthesis.speak(msg); };

  return (
    <div className="bg-gray-100 min-h-screen pb-20 font-sans">
      
      {showNotification && (
          <div className="fixed top-4 left-4 right-4 bg-green-600 text-white p-4 rounded-xl shadow-2xl z-50 flex items-center justify-between animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-full"><Bell size={24} className="animate-bounce"/></div>
                  <div><h4 className="font-bold">New Order!</h4><p className="text-xs text-green-100">Check Orders Tab</p></div>
              </div>
              <button onClick={() => setShowNotification(false)}><X size={20}/></button>
          </div>
      )}

      <div className="bg-green-700 text-white p-4 sticky top-0 z-10 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold">KGN Admin</h1>
        <div className="flex gap-3">
             <button onClick={enableVoice} className="bg-green-800 p-2 rounded-full border border-green-600 animate-pulse text-white flex gap-1 items-center px-3"><Mic size={16}/> <span className="text-xs font-bold">Voice</span></button>
             {activeTab === 'products' && (
                <div className="flex gap-2">
                    <button onClick={bulkImport} className="bg-green-800 p-2 rounded-full border border-green-600 shadow-sm" title="Import Video Items"><DownloadCloud size={20}/></button>
                    <button onClick={() => { setShowAddModal(true); setIsEditing(null); setProductForm({ name: '', price: '', costPrice: '', category: '', packSize: '', unit: 'pkt', stock: '', imageUrl: '' }) }} className="bg-white text-green-700 p-2 rounded-full shadow"><Plus size={24} /></button>
                </div>
            )}
            <button onClick={() => signOut(getAuth())} className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow"><LogOut size={20}/></button>
        </div>
      </div>

      <div className="flex bg-white shadow-sm mb-4">
          {['orders', 'products', 'reports'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-3 text-xs font-bold uppercase border-b-4 ${activeTab === tab ? 'border-green-600 text-green-700' : 'border-transparent text-gray-400'}`}>{tab}</button>
          ))}
      </div>

      <div className="p-4 max-w-[1400px] mx-auto">
        {(activeTab === 'orders' || activeTab === 'reports') && (
             <div className="flex items-center gap-2 mb-4 bg-white p-2 rounded-lg w-fit shadow-sm">
                 <Filter size={16} className="text-gray-500 ml-2"/>
                 <select className="p-2 text-sm font-bold outline-none bg-transparent" value={dateRange} onChange={e => setDateRange(e.target.value)}>
                    <option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="all">All Time</option><option value="custom">Custom</option>
                 </select>
                 {dateRange === 'custom' && (<div className="flex gap-2 items-center border-l pl-2 ml-2"><input type="date" className="text-xs p-1 border rounded" onChange={e => setCustomStart(e.target.value)}/><span className="text-gray-400">-</span><input type="date" className="text-xs p-1 border rounded" onChange={e => setCustomEnd(e.target.value)}/></div>)}
                 <button onClick={handleLoadData} className="ml-2 bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow hover:bg-blue-700 flex items-center gap-1">{isLoading ? <RefreshCw size={14} className="animate-spin"/> : 'Load Data'}</button>
             </div>
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {orders.length === 0 ? <p className="text-gray-400 text-sm p-4">No orders found.</p> : orders.map(order => (
              <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="p-3 bg-gray-50 border-b flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-gray-800">{order.customerName}</span>
                            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${order.status === 'Delivered' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{order.status}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-600 mt-1"><span>{order.mobile}</span><a href={`tel:${order.mobile}`} className="bg-green-100 text-green-700 p-1.5 rounded-full hover:bg-green-200"><PhoneCall size={14}/></a></div>
                    </div>
                </div>
                <div className="p-3 flex-1">
                    <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Calendar size={12}/> {formatDate(order.timestamp)}</p>
                    <div className="font-bold text-xl mb-1">₹{order.total}</div>
                    <p className="text-xs text-gray-500 mb-4">{order.items.length} Items • {order.paymentMethod}</p>
                    <div className="flex gap-2 mt-auto">
                        <button onClick={() => setViewOrder(order)} className="flex-1 bg-blue-50 text-blue-600 py-2 rounded-lg text-xs font-bold border border-blue-100 hover:bg-blue-100">View</button>
                        {order.status !== 'Delivered' && (<button onClick={() => { let s = order.status === "Received" ? "Out for Delivery" : "Delivered"; updateDoc(doc(db, "orders", order.id), { status: s }); }} className="flex-1 bg-green-50 text-green-600 py-2 rounded-lg text-xs font-bold border border-green-100 hover:bg-green-100">Update</button>)}
                    </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PRODUCTS TAB */}
        {activeTab === 'products' && (
          <div>
            <div className="flex justify-between items-center mb-3"><h2 className="font-bold text-gray-500 text-sm">Total Items: {products.length}</h2></div>
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
                        <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={24}/></button>
                        <h2 className="text-lg font-bold mb-6 text-gray-800 border-b pb-2">{isEditing ? 'Edit Product' : 'Add New Product'}</h2>
                        <form onSubmit={handleSaveProduct} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label><input className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})} list="cats" /><datalist id="cats">{existingCategories.map(c => <option key={c} value={c} />)}</datalist></div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Stock</label><input type="number" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={productForm.stock} onChange={e => setProductForm({...productForm, stock: e.target.value})} /></div>
                            </div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Product Name</label><input className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} /></div>
                            <div className="grid grid-cols-3 gap-4">
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Size</label><input className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={productForm.packSize} onChange={e => setProductForm({...productForm, packSize: e.target.value})} /></div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit</label><select className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={productForm.unit} onChange={e => setProductForm({...productForm, unit: e.target.value})}><option value="kg">kg</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option><option value="pkt">pkt</option><option value="pcs">pcs</option></select></div>
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Price</label><input type="number" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} /></div>
                            </div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cost Price</label><input type="number" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={productForm.costPrice} onChange={e => setProductForm({...productForm, costPrice: e.target.value})} /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Image URL</label><input className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={productForm.imageUrl} onChange={e => setProductForm({...productForm, imageUrl: e.target.value})} /></div>
                            <button className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg">{isEditing ? 'Update' : 'Save'}</button>
                        </form>
                    </div>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map(p => (
                    <div key={p.id} className="bg-white p-3 rounded-lg shadow-sm flex items-center justify-between border border-gray-200 hover:border-blue-300 transition-colors">
                        <div className="flex items-center gap-4">
                            <img src={p.imageUrl} onError={(e) => {e.target.onerror=null; e.target.src="https://via.placeholder.com/150?text=No+Img"}} className="h-12 w-12 object-contain rounded bg-gray-50 border"/>
                            <div><h4 className="font-bold text-gray-800 text-sm">{p.name}</h4><div className="flex gap-2 mt-1"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">Stock: {p.stock} {p.unit}</span><span className="text-xs bg-blue-50 px-2 py-0.5 rounded text-blue-600">Size: {p.packSize}{p.unit}</span></div></div>
                        </div>
                        <div className="flex items-center gap-4"><span className="font-bold text-lg text-green-700">₹{p.price}</span><div className="flex gap-1"><button onClick={() => { setProductForm({...p, costPrice: p.costPrice||'', unit: p.unit||'pkt'}); setIsEditing(p.id); setShowAddModal(true); }} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={18}/></button><button onClick={() => { if(confirm("Delete?")) deleteDoc(doc(db, "products", p.id)) }} className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18}/></button></div></div>
                    </div>
                ))}
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
           <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"><div className="text-xs font-bold uppercase opacity-60 mb-1">Total Sales</div><div className="text-2xl font-bold text-gray-800">₹{totalRevenue}</div></div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"><div className="text-xs font-bold uppercase opacity-60 mb-1 text-green-600">Net Profit</div><div className="text-2xl font-bold text-green-600">₹{totalProfit.toFixed(0)}</div></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between font-bold text-xs text-gray-500 uppercase"><span>Date</span><span>Customer</span><span>Status</span><span>Amt</span></div>
                  {validOrders.length === 0 ? (<div className="p-8 text-center text-gray-400 text-sm">No data loaded. Use "Load Data".</div>) : (
                      validOrders.map(order => (
                          <div key={order.id} className="p-3 border-b border-gray-100 flex justify-between items-center text-sm last:border-0 hover:bg-gray-50">
                              <span className="text-gray-500 w-24 text-xs">{formatDate(order.timestamp)}</span>
                              <span className="font-bold flex-1 truncate text-xs">{order.customerName}</span>
                              <span className={`text-[10px] font-bold px-2 py-1 rounded w-20 text-center ${order.status === 'Delivered' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{order.status}</span>
                              <span className="font-bold text-right w-16 text-xs">₹{order.total}</span>
                          </div>
                      ))
                  )}
              </div>
           </div>
        )}

        {/* ORDER VIEW MODAL */}
        {viewOrder && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
                    <div className="bg-green-700 p-4 text-white flex justify-between items-center"><h2 className="font-bold">Order Details</h2><button onClick={() => setViewOrder(null)}><X size={24}/></button></div>
                    <div className="p-6 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-start mb-4">
                            <div><h3 className="font-bold text-xl">{viewOrder.customerName}</h3><a href={`tel:${viewOrder.mobile}`} className="text-blue-600 font-bold flex items-center gap-1 mt-1"><PhoneCall size={14}/> {viewOrder.mobile}</a></div>
                            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold">{viewOrder.paymentMethod}</span>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm border border-gray-100">
                            <p className="font-bold text-gray-500 text-xs uppercase mb-1">Delivery Address</p><p>{viewOrder.address}</p>
                            {viewOrder.location && (
                                <a href={`http://googleusercontent.com/maps.google.com/?q=${viewOrder.location.lat},${viewOrder.location.long}`} target="_blank" rel="noreferrer" className="text-blue-600 underline flex items-center gap-1 mt-2 font-bold">
                                    <MapPin size={14}/> Open Map Location
                                </a>
                            )}
                        </div>
                        <h4 className="font-bold border-b pb-2 mb-2">Items</h4>
                        <div className="space-y-3">
                            {viewOrder.items.map((item, i) => (
                                <div key={i} className="flex justify-between items-center">
                                    <div className="flex items-center gap-3"><img src={item.imageUrl} onError={(e) => {e.target.onerror=null; e.target.src="https://via.placeholder.com/50"}} className="w-10 h-10 object-contain rounded bg-gray-50 border"/><div><p className="font-bold text-sm">{item.name}</p><p className="text-xs text-gray-500">{item.packSize}{item.unit}</p></div></div>
                                    <div className="text-right"><p className="font-bold">x{item.qty}</p><p className="text-xs text-gray-500">₹{item.price * item.qty}</p></div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-6 pt-4 border-t border-dashed"><span className="font-bold text-lg">Total</span><span className="font-bold text-2xl text-green-700">₹{viewOrder.total}</span></div>
                    </div>
                    <div className="p-4 bg-gray-50 border-t flex gap-3">
                         {viewOrder.status !== 'Delivered' && (<button onClick={() => { let s = viewOrder.status === "Received" ? "Out for Delivery" : "Delivered"; updateDoc(doc(db, "orders", viewOrder.id), { status: s }); setViewOrder(null); }} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold">{viewOrder.status === 'Received' ? 'Mark Out for Delivery' : 'Mark Delivered'}</button>)}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

// --- STORE FRONT ---
function StoreFront({ cart, addToCart, removeFromCart }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // If App (APK), go to Admin
  useEffect(() => { if (Capacitor.isNativePlatform()) navigate('/admin'); }, [navigate]);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(prods);
      setCategories(['All', ...new Set(prods.map(p => p.category).filter(Boolean))]);
    });
    return () => unsubscribe();
  }, []);

  const filtered = products.filter(p => {
    const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);
  const cartTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const getQty = (id) => cart.find(x => x.id === id)?.qty || 0;

  return (
    <div className="bg-[#f3f4f6] min-h-screen pb-32 font-sans">
      <div className="bg-[#013a2b] text-white pt-4 pb-6 px-4 sticky top-0 z-30 shadow-lg rounded-b-[20px]">
        <div className="flex justify-between items-start mb-4">
            <div>
                <h1 className="text-xl font-bold tracking-wide uppercase">M R N MULLA KIRANA SOHP</h1>
                <p className="text-xs text-gray-300">Chittapur Karnataka</p>
                <div className="flex gap-2 mt-2">
                    <span className="bg-black/30 px-2 py-0.5 rounded flex items-center gap-1 text-[10px]"><MapPin size={10}/> 3.18 Km</span>
                    <span className="bg-[#c6f6d5] text-[#013a2b] px-2 py-0.5 rounded text-[10px] font-bold border border-[#013a2b]">OPEN</span>
                </div>
            </div>
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"><User size={16}/></div>
        </div>
        <div className="flex gap-2">
            <div className="bg-white rounded-full flex items-center px-4 py-2.5 flex-1 shadow-inner">
                <Search size={18} className="text-gray-400"/>
                <input placeholder="Search Products" className="bg-transparent border-none outline-none text-sm w-full ml-2 text-gray-700 placeholder-gray-400" onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="bg-white rounded-full w-10 flex items-center justify-center text-gray-500 shadow-sm"><ChevronDown size={20}/></div>
        </div>
      </div>

      <div className="flex overflow-x-auto px-4 py-4 gap-4 scrollbar-hide bg-white mb-2">
          {categories.map(cat => (
              <div key={cat} onClick={() => setActiveCategory(cat)} className="flex flex-col items-center min-w-[70px] cursor-pointer">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-1 border-2 ${activeCategory === cat ? 'border-[#013a2b] bg-[#e6fffa]' : 'border-gray-100 bg-gray-50'}`}>
                      <span className="text-[10px] font-bold text-center leading-none text-[#013a2b]">{cat.substring(0,2)}</span>
                  </div>
                  <span className={`text-[10px] font-bold text-center ${activeCategory === cat ? 'text-[#013a2b]' : 'text-gray-500'}`}>{cat}</span>
              </div>
          ))}
      </div>

      <div className="px-3 pb-4">
        <div className="flex justify-between items-center mb-3 px-1">
            <h2 className="font-bold text-gray-700 text-sm">All ({filtered.length})</h2>
            <div className="flex items-center gap-1 text-xs text-gray-500">Sort By <ChevronDown size={12}/></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
            {filtered.map(p => (
            <div key={p.id} className="bg-white p-2 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.1)] border border-gray-100 flex flex-col justify-between h-full relative">
                <div className="h-20 w-full flex items-center justify-center bg-white mb-1 relative">
                    <img src={p.imageUrl} onError={(e) => e.target.src = 'https://via.placeholder.com/150'} className="h-full w-full object-contain" />
                </div>
                <div className="mb-1">
                    <h3 className="font-bold text-[11px] text-gray-800 leading-tight line-clamp-2 h-8">{p.name}</h3>
                    <p className="text-[9px] text-gray-400 font-medium uppercase mt-0.5">{p.packSize || '1'} {p.unit || 'UNIT'}</p>
                </div>
                <div className="flex flex-col gap-1 mt-auto">
                    <span className="font-bold text-sm text-black">₹{p.price}</span>
                    {getQty(p.id) === 0 ? (
                        <button onClick={() => addToCart(p)} className="w-full bg-[#1a1a1a] text-white py-1 rounded text-xs font-bold shadow-md hover:bg-black flex items-center justify-center"><Plus size={14}/></button>
                    ) : (
                        <div className="flex items-center justify-between bg-white border border-gray-300 rounded h-6 px-1">
                            <button onClick={() => removeFromCart(p)} className="text-gray-600"><Minus size={12}/></button>
                            <span className="text-[10px] font-bold">{getQty(p.id)}</span>
                            <button onClick={() => addToCart(p)} className="text-gray-600"><Plus size={12}/></button>
                        </div>
                    )}
                </div>
            </div>
            ))}
        </div>
      </div>

      {cartCount > 0 && (
          <div className="fixed bottom-4 left-3 right-3 z-30 animate-in slide-in-from-bottom-4 duration-300">
              <div onClick={() => navigate('/checkout')} className="bg-[#013a2b] text-white p-3 rounded-xl shadow-2xl flex justify-between items-center cursor-pointer">
                  <div className="flex flex-col pl-2">
                      <span className="text-[10px] font-bold text-green-200 uppercase tracking-wide">{cartCount} ITEMS</span>
                      <span className="font-bold text-base leading-none">₹{cartTotal}</span>
                  </div>
                  <div className="flex items-center gap-1 font-bold text-sm pr-2">View Cart <ChevronRight size={16}/></div>
              </div>
          </div>
      )}
    </div>
  );
}

// --- CHECKOUT ---
function Checkout({ cart, clearCart }) {
  const [form, setForm] = useState({ name: '', mobile: '', house: '', area: '' });
  const [location, setLocation] = useState(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const navigate = useNavigate();
  const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

  const checkPreviousOrder = async (mobileNum) => {
    if(mobileNum.length !== 10) return;
    const q = query(collection(db, "orders"), where("mobile", "==", mobileNum), limit(1));
    const snapshot = await getDocs(q);
    if(!snapshot.empty) {
        const oldData = snapshot.docs[0].data();
        setForm({ name: oldData.customerName, mobile: mobileNum, house: '', area: oldData.address });
        setLocation(oldData.location);
        alert(`Welcome back ${oldData.customerName}!`);
    }
  };

  const getGPS = () => {
    setLoadingLoc(true);
    if (!("geolocation" in navigator)) { alert("GPS not supported"); return setLoadingLoc(false); }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocation({ lat: pos.coords.latitude, long: pos.coords.longitude }); setLoadingLoc(false); },
      (error) => { setLoadingLoc(false); alert("Allow Location Access in Browser Settings"); }, { enableHighAccuracy: true }
    );
  };

  const handleRazorpay = async () => {
      // VALIDATION
      if (!form.name || !form.mobile || !location) return alert("Please fill Name, Mobile & Select Location on Map.");
      
      const res = await loadRazorpayScript();
      if (!res) return alert('Razorpay failed to load');

      // FIXED: Client-side only payment (Works in APK without backend)
      const options = {
          key: RAZORPAY_KEY_ID, 
          amount: Math.round(total * 100), 
          currency: "INR",
          name: "MRN Mulla Kirana",
          description: "Grocery Order",
          // 👇 IMPORTANT: Add your Configuration ID here to show UPI
          config_id: "conf_YOUR_ID_FROM_DASHBOARD", 
          
          handler: async function (response) { 
              await confirmOrder(`Prepaid (ID: ${response.razorpay_payment_id})`); 
          },
          prefill: { name: form.name, contact: form.mobile, email: "customer@example.com" },
          theme: { color: "#013a2b" },
          modal: { ondismiss: function() { alert("Payment Cancelled"); } }
      };
      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
  };

  const confirmOrder = async (method) => {
    if (!form.name || !form.mobile || !location) return alert("Please fill details & mark location.");
    
    const fullAddress = form.house ? `${form.house}, ${form.area}` : form.area; 
    const orderData = { customerName: form.name, mobile: form.mobile, address: fullAddress, location, items: cart, total, paymentMethod: method, status: 'Received', timestamp: serverTimestamp() };
    await addDoc(collection(db, "orders"), orderData);
    await sendDiscordAlert(orderData); 
    alert("Order Placed Successfully!"); clearCart(); navigate('/');
  };

  if (cart.length === 0) return <div className="p-10 text-center text-gray-500 font-medium">Your cart is empty <br/><button onClick={() => navigate('/')} className="text-[#013a2b] mt-4 font-bold">Go Shop</button></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      <div className="bg-white p-4 shadow-sm mb-2"><h2 className="font-bold text-lg text-gray-800">Cart Items</h2></div>
      
      <div className="bg-white px-4 py-2 mb-2">
          {cart.map(item => (
              <div key={item.id} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                  <div className="flex gap-3 items-center">
                      <img src={item.imageUrl} className="w-10 h-10 object-contain"/>
                      <div>
                          <p className="text-sm font-bold text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.packSize} {item.unit}</p>
                          <p className="text-xs font-bold text-black mt-0.5">₹{item.price}</p>
                      </div>
                  </div>
                  <div className="font-bold text-sm">x{item.qty}</div>
              </div>
          ))}
      </div>

      <div className="bg-white p-4 mb-2">
          <div className="flex justify-between text-sm mb-2 text-gray-600"><span>Sub Total</span><span>₹{total}</span></div>
          <div className="flex justify-between text-sm mb-2 text-gray-600"><span>Delivery Charges</span><span className="text-green-600">Free</span></div>
          <div className="flex justify-between font-bold text-lg pt-2 border-t text-black"><span>Total</span><span>₹{total}</span></div>
      </div>

      <div className="bg-white p-4 mb-4">
        <h2 className="font-bold text-sm mb-3 uppercase text-gray-500">Shipping Address</h2>
        <input placeholder="Mobile Number" type="number" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm mb-2" value={form.mobile} onChange={e => { setForm({...form, mobile: e.target.value}); if(e.target.value.length === 10) checkPreviousOrder(e.target.value); }} />
        <input placeholder="Name" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm mb-2" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
        <div className="flex gap-2 mb-2">
            <input placeholder="House No" className="w-1/2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={form.house} onChange={e => setForm({...form, house: e.target.value})} />
            <input placeholder="Area" className="w-1/2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={form.area} onChange={e => setForm({...form, area: e.target.value})} />
        </div>
        
        {/* LARGE MAP FOR PINNING */}
        <div className="h-96 rounded-lg overflow-hidden border border-gray-200 relative mb-4 z-0">
            <MapContainer center={location ? [location.lat, location.long] : DEFAULT_MAP_CENTER} zoom={14} className="h-full w-full">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
                <LocationMarker location={location} setLocation={setLocation} />
                <RecenterAutomatically location={location} />
            </MapContainer>
            {!location && <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-white px-3 py-1 text-xs font-bold shadow rounded-full z-[400] text-red-500">Tap Map to Pin Location</div>}
        </div>
        
        <button onClick={getGPS} className="w-full bg-blue-50 text-blue-600 py-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 mb-2"><Crosshair size={16}/> {loadingLoc ? "Locating..." : "Use My GPS Location"}</button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t flex gap-3 z-30">
          <button onClick={handleRazorpay} className="flex-1 bg-[#013a2b] text-white py-3 rounded-lg font-bold text-sm shadow-lg flex items-center justify-center gap-2"><CreditCard size={16}/> Pay Online</button>
          <button onClick={() => confirmOrder('COD')} className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2"><Banknote size={16}/> COD</button>
      </div>
    </div>
  );
}

export default function App() {
  const [cart, setCart] = useState([]);
  const addToCart = (p) => setCart(prev => { const ex = prev.find(x => x.id === p.id); return ex ? prev.map(x => x.id === p.id ? {...x, qty: x.qty + 1} : x) : [...prev, {...p, qty: 1}]; });
  const removeFromCart = (p) => setCart(prev => { const ex = prev.find(x => x.id === p.id); return ex.qty === 1 ? prev.filter(x => x.id !== p.id) : prev.map(x => x.id === p.id ? {...x, qty: x.qty - 1} : x); });

  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        <Route path="/" element={<StoreFront cart={cart} addToCart={addToCart} removeFromCart={removeFromCart} />} />
        <Route path="/checkout" element={<Checkout cart={cart} clearCart={() => setCart([])} />} />
      </Routes>
    </Router>
  );
}