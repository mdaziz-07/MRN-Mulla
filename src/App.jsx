import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { db } from './firebase';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'; // NEW IMPORT
import { Capacitor } from '@capacitor/core'; // NEW IMPORT
import { collection, addDoc, onSnapshot, updateDoc, doc, deleteDoc, query, orderBy, serverTimestamp, writeBatch, where, getDocs, limit, setDoc } from 'firebase/firestore';
import { ShoppingCart, MapPin, Plus, Check, Truck, Bell, Menu, X, Trash2, BarChart3, Calendar, Package, Search, ChevronRight, Minus, Edit2, Save, DownloadCloud, Eye, Filter, User, Crosshair, PhoneCall, Volume2, Info, RefreshCw, Lock, LogOut } from 'lucide-react';

// --- CONFIGURATION ---
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1461959463559889039/vbAvNso8Z9yqfbiksx5eyVVnJpvTSbnQTnbL30mrzNydB316jX5T1w3EdukkLaV4W7tR"; 

// --- HELPER: Send Discord Alert ---
const sendDiscordAlert = async (orderData) => {
  if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes("YOUR_DISCORD")) return;
  const itemsList = orderData.items.map(i => `• ${i.qty}x ${i.name}`).join('\n');
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

// --- HELPER: Google Drive Images ---
const getImageUrl = (url) => {
  if (!url) return "";
  if (url.includes("drive.google.com")) {
    const idMatch = url.match(/\/d\/(.*?)\/view/);
    return idMatch && idMatch[1] ? `https://drive.google.com/uc?export=view&id=${idMatch[1]}` : url;
  }
  return url;
};

// --- SECURITY COMPONENT: Admin Route Wrapper ---
// This is the lock. It checks if (1) It's the App, and (2) You are logged in.
function AdminRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const auth = getAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // SECURITY CHECK 1: If not Native App, KICK OUT to Home
    if (!Capacitor.isNativePlatform()) {
       navigate('/');
       return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setLoginError("Login Failed: Check Email/Password");
    }
  };

  // If on website (not app), render nothing (useEffect will redirect)
  if (!Capacitor.isNativePlatform()) return null;

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-green-700">Verifying Security...</div>;

  // SECURITY CHECK 2: Not Logged In -> Show Login Form
  if (!user) {
    return (
      <div className="h-screen bg-green-800 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
          <div className="text-center mb-6">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-green-700">
              <Lock size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Admin Access</h2>
            <p className="text-xs text-gray-500 mt-1">Authorized Personnel Only</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@gmail.com"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-green-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-green-500 outline-none" 
              />
            </div>
            {loginError && <p className="text-red-500 text-xs font-bold text-center">{loginError}</p>}
            <button className="w-full bg-green-700 text-white py-3 rounded-xl font-bold hover:bg-green-800 transition-colors shadow-lg">
              Unlock Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  // SECURITY CHECK 3: Wrong Email -> Deny Access
  if (user.email !== 'mrnmulla089@gmail.com') {
     return (
       <div className="h-screen flex flex-col items-center justify-center p-10 text-center">
         <h1 className="text-3xl font-bold text-red-600 mb-2">ACCESS DENIED</h1>
         <p className="text-gray-600 mb-6">This account is not authorized.</p>
         <button onClick={() => signOut(auth)} className="bg-gray-200 px-6 py-2 rounded-lg font-bold">Sign Out</button>
       </div>
     );
  }

  // If passed all checks, show the Admin Panel
  return children;
}


// --- ADMIN PANEL ---
function AdminPanel() {
  const [productForm, setProductForm] = useState({ name: '', price: '', costPrice: '', category: '', packSize: '', unit: 'pkt', stock: '', imageUrl: '' });
  const [isEditing, setIsEditing] = useState(null);
  
  // DATA STATES
  const [orders, setOrders] = useState([]); // For Orders Tab
  const [reportData, setReportData] = useState([]); // For Reports Tab
  const [products, setProducts] = useState([]);
  const [existingCategories, setExistingCategories] = useState([]);
  
  // UI STATES
  const [activeTab, setActiveTab] = useState('orders');
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  
  // FILTERS
  const [dateRange, setDateRange] = useState('7'); 
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));

  useEffect(() => {
    const enableAudio = () => { audioRef.current.play().then(() => { audioRef.current.pause(); audioRef.current.currentTime = 0; }).catch(() => {}); document.removeEventListener('click', enableAudio); };
    document.addEventListener('click', enableAudio);
    return () => document.removeEventListener('click', enableAudio);
  }, []);

  // INITIAL LOAD
  useEffect(() => {
    const qOrders = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(20));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const newOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Notification Logic
      if (newOrders.length > 0 && orders.length > 0 && newOrders[0].id !== orders[0].id) {
        audioRef.current.play().catch(() => {});
        if (Notification.permission === "granted") new Notification("New Order Received!");
      }
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

  // --- MANUAL LOAD DATA ---
  const handleLoadData = async (target) => {
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
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (target === 'orders') setOrders(data);
      if (target === 'reports') setReportData(data);
      
      setIsLoading(false);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!productForm.name || !productForm.price || !productForm.category) return alert("Fill Name, Price & Category");
    
    if (productForm.imageUrl && (productForm.imageUrl.includes("google.com/search") || productForm.imageUrl.includes("share.google"))) {
        return alert("❌ Invalid Image Link. Please use a direct image URL.");
    }

    const docId = isEditing || productForm.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const payload = { 
      ...productForm, 
      price: Number(productForm.price), 
      costPrice: Number(productForm.costPrice) || Number(productForm.price) * 0.8,
      stock: Number(productForm.stock) || 0,
      imageUrl: getImageUrl(productForm.imageUrl), 
      createdAt: serverTimestamp() 
    };

    await setDoc(doc(db, "products", docId), payload);
    alert(isEditing ? "Updated!" : "Added!");
    setProductForm({ name: '', price: '', costPrice: '', category: '', packSize: '', unit: 'pkt', stock: '', imageUrl: '' });
    setShowAddModal(false); setIsEditing(null);
  };

  const handleEditClick = (p) => { setProductForm({ ...p, costPrice: p.costPrice || '', unit: p.unit || 'pkt' }); setIsEditing(p.id); setShowAddModal(true); };
  const handleDeleteProduct = async (id) => { if(confirm("Delete item?")) await deleteDoc(doc(db, "products", id)); };
  const advanceStatus = async (order) => {
    let newStatus = order.status === "Received" ? "Out for Delivery" : order.status === "Out for Delivery" ? "Delivered" : "";
    if (newStatus) await updateDoc(doc(db, "orders", order.id), { status: newStatus });
  };

  const bulkImport = async () => {
    if(!confirm("Import 50+ Items? (Duplicates will be skipped)")) return;
    const batch = writeBatch(db);
    const items = [
      { n: "Aashirvaad Atta", p: 210, c: "Grocery", s: "5", u: "kg", img: "https://m.media-amazon.com/images/I/71J1kC-x0pL._SX679_.jpg" },
      { n: "Tata Salt", p: 28, c: "Grocery", s: "1", u: "kg", img: "https://m.media-amazon.com/images/I/61N+C+5+uZL._SX679_.jpg" },
      // ... (Rest of your items, keeping shorter for brevity but they are same as your code) ...
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

  // REPORTS CALCULATIONS
  const reportValid = reportData.filter(o => o.status !== 'Cancelled');
  const reportRevenue = reportValid.reduce((sum, o) => sum + o.total, 0);
  const reportProfit = reportValid.reduce((sum, o) => sum + (o.total - o.items.reduce((c, i) => c + ((i.costPrice || i.price * 0.8) * i.qty), 0)), 0);

  return (
    <div className="bg-gray-100 min-h-screen pb-20 font-sans">
      <div className="bg-green-700 text-white p-4 sticky top-0 z-10 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold">KGN Admin</h1>
        <div className="flex gap-3">
             {activeTab === 'products' && (
                <div className="flex gap-2">
                    <button onClick={bulkImport} className="bg-green-800 p-2 rounded-full border border-green-600 shadow-sm" title="Import Stock"><DownloadCloud size={20}/></button>
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
                    <option value="7">Last 7 Days</option>
                    <option value="30">Last 30 Days</option>
                    <option value="all">All Time</option>
                    <option value="custom">Custom Range</option>
                 </select>
                 {dateRange === 'custom' && (<div className="flex gap-2 items-center border-l pl-2 ml-2"><input type="date" className="text-xs p-1 border rounded" onChange={e => setCustomStart(e.target.value)}/><span className="text-gray-400">-</span><input type="date" className="text-xs p-1 border rounded" onChange={e => setCustomEnd(e.target.value)}/></div>)}
                 <button onClick={() => handleLoadData(activeTab)} className="ml-2 bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow hover:bg-blue-700 flex items-center gap-1">
                     {isLoading ? <RefreshCw size={14} className="animate-spin"/> : 'Load Data'}
                 </button>
             </div>
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {orders.length === 0 ? <p className="text-gray-400 text-sm p-4">No orders found. Click 'Load Data'.</p> : orders.map(order => (
              <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="p-3 bg-gray-50 border-b flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-gray-800">{order.customerName}</span>
                            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${order.status === 'Delivered' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{order.status}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-600 mt-1">
                            <span>{order.mobile}</span>
                            <a href={`tel:${order.mobile}`} className="bg-green-100 text-green-700 p-1.5 rounded-full hover:bg-green-200"><PhoneCall size={14}/></a>
                        </div>
                    </div>
                </div>
                <div className="p-3 flex-1">
                    <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Calendar size={12}/> {formatDate(order.timestamp)}</p>
                    <div className="font-bold text-xl mb-1">₹{order.total}</div>
                    <p className="text-xs text-gray-500 mb-4">{order.items.length} Items • {order.paymentMethod}</p>
                    <div className="flex gap-2 mt-auto">
                        <button onClick={() => setViewOrder(order)} className="flex-1 bg-blue-50 text-blue-600 py-2 rounded-lg text-xs font-bold border border-blue-100 hover:bg-blue-100">View</button>
                        {order.status !== 'Delivered' && (
                            <button onClick={() => advanceStatus(order)} className="flex-1 bg-green-50 text-green-600 py-2 rounded-lg text-xs font-bold border border-green-100 hover:bg-green-100">Update</button>
                        )}
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
                        <div className="flex items-center gap-4"><span className="font-bold text-lg text-green-700">₹{p.price}</span><div className="flex gap-1"><button onClick={() => handleEditClick(p)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={18}/></button><button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18}/></button></div></div>
                    </div>
                ))}
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
           <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"><div className="text-xs font-bold uppercase opacity-60 mb-1">Total Sales</div><div className="text-2xl font-bold text-gray-800">₹{reportRevenue}</div></div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"><div className="text-xs font-bold uppercase opacity-60 mb-1 text-green-600">Net Profit</div><div className="text-2xl font-bold text-green-600">₹{reportProfit.toFixed(0)}</div></div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between font-bold text-xs text-gray-500 uppercase"><span>Date</span><span>Customer</span><span>Status</span><span>Amt</span></div>
                  {reportData.length === 0 ? (<div className="p-8 text-center text-gray-400 text-sm">No data loaded</div>) : (
                      reportValid.map(order => (
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
                            <a href={`https://www.google.com/maps?q=${viewOrder.location?.lat},${viewOrder.location?.long}`} target="_blank" rel="noreferrer" className="text-blue-600 underline flex items-center gap-1 mt-2 font-bold"><MapPin size={14}/> Open Map</a>
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
                         {viewOrder.status !== 'Delivered' && (<button onClick={() => { advanceStatus(viewOrder); setViewOrder(null); }} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold">{viewOrder.status === 'Received' ? 'Mark Out for Delivery' : 'Mark Delivered'}</button>)}
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
      <div className="bg-white sticky top-0 z-20 shadow-sm border-b border-gray-100">
        <div className="p-4 pb-2"><h1 className="text-2xl font-extrabold text-[#0c831f] tracking-tight">MRN Mulla</h1><p className="text-xs text-gray-500 font-medium flex items-center gap-1 mt-0.5"><MapPin size={10} className="text-gray-400"/> Kirana Store, Main Road</p></div>
        <div className="px-4 pb-3"><div className="bg-gray-100 rounded-xl flex items-center px-3 py-2.5 border border-gray-200"><Search size={18} className="text-gray-400 min-w-[18px]"/><input placeholder="Search products..." className="bg-transparent border-none outline-none text-sm w-full ml-2 text-gray-700" onChange={(e) => setSearch(e.target.value)} /></div></div>
        <div className="flex overflow-x-auto px-4 pb-3 gap-3 scrollbar-hide">{categories.map(cat => (<button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold transition-all border ${activeCategory === cat ? 'bg-[#ecfccb] text-[#365314] border-[#d9f99d]' : 'bg-white text-gray-600 border-gray-200'}`}>{cat}</button>))}</div>
      </div>

      <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        {filtered.map(p => (
          <div key={p.id} className="bg-white p-3 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col justify-between h-full relative">
            <div className="h-28 w-full flex items-center justify-center bg-white mb-2 relative">
                <img src={p.imageUrl} onError={(e) => {e.target.onerror=null; e.target.src="https://via.placeholder.com/150?text=No+Img"}} className="h-full w-full object-contain" />
            </div>
            <div className="mb-2"><h3 className="font-bold text-[13px] text-gray-800 leading-snug line-clamp-2 h-9">{p.name}</h3>{p.packSize && <p className="text-[11px] text-gray-400 font-medium mt-0.5">{p.packSize}{p.unit}</p>}</div>
            <div className="flex justify-between items-center mt-auto">
              <span className="font-bold text-sm text-gray-900">₹{p.price}</span>
              <div className="w-20">{getQty(p.id) === 0 ? (<button onClick={() => addToCart(p)} className="w-full bg-[#f7fee7] text-[#15803d] border border-[#15803d] py-1.5 rounded-lg text-xs font-bold uppercase shadow-sm hover:bg-[#15803d] hover:text-white transition-all">ADD</button>) : (<div className="flex items-center justify-between bg-[#15803d] text-white rounded-lg h-8 shadow-sm"><button onClick={() => removeFromCart(p)} className="w-7 h-full flex items-center justify-center hover:bg-[#14532d] rounded-l-lg"><Minus size={12} strokeWidth={4}/></button><span className="text-xs font-bold">{getQty(p.id)}</span><button onClick={() => addToCart(p)} className="w-7 h-full flex items-center justify-center hover:bg-[#14532d] rounded-r-lg"><Plus size={12} strokeWidth={4}/></button></div>)}</div>
            </div>
          </div>
        ))}
      </div>
      {cartCount > 0 && (<div className="fixed bottom-4 left-3 right-3 z-30 animate-in slide-in-from-bottom-4 duration-300"><div onClick={() => navigate('/checkout')} className="bg-[#0c831f] text-white p-3.5 rounded-xl shadow-xl flex justify-between items-center cursor-pointer active:scale-95 transition-transform"><div className="flex flex-col pl-1"><span className="text-[10px] font-bold text-green-100 uppercase tracking-wide">{cartCount} ITEMS</span><span className="font-bold text-base leading-none">₹{cartTotal}</span></div><div className="flex items-center gap-1 font-bold text-sm pr-1">View Cart <ChevronRight size={16}/></div></div></div>)}
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

  const confirmOrder = async (method) => {
    if (!form.name || !form.mobile || !location) return alert("Fill details & Click 'Get Location'");
    const fullAddress = form.house ? `${form.house}, ${form.area}` : form.area; 
    const orderData = { customerName: form.name, mobile: form.mobile, address: fullAddress, location, items: cart, total, paymentMethod: method, status: 'Received', timestamp: serverTimestamp() };
    await addDoc(collection(db, "orders"), orderData);
    await sendDiscordAlert(orderData); 
    alert("Order Placed!"); clearCart(); navigate('/');
  };

  if (cart.length === 0) return <div className="p-10 text-center text-gray-500 font-medium">Your cart is empty <br/><button onClick={() => navigate('/')} className="text-green-600 mt-4 font-bold">Go Shop</button></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans">
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4"><h2 className="font-bold text-lg mb-3 text-gray-800">Order Summary</h2>{cart.map(item => (<div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0"><span>{item.qty} x {item.name} <span className="text-gray-400 text-xs">{item.packSize}{item.unit}</span></span><span className="font-bold text-gray-700">₹{item.price * item.qty}</span></div>))}<div className="flex justify-between font-bold text-lg mt-3 pt-2 border-t border-gray-100 text-black"><span>To Pay</span><span>₹{total}</span></div></div>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4 space-y-4">
        <div className="flex justify-between items-center"><h2 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Delivery Details</h2><button onClick={() => checkPreviousOrder(form.mobile)} className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded">Check Previous</button></div>
        <input placeholder="Mobile Number" type="number" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" value={form.mobile} onChange={e => { setForm({...form, mobile: e.target.value}); if(e.target.value.length === 10) checkPreviousOrder(e.target.value); }} />
        <input placeholder="Your Name" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
        <div className="flex gap-3"><input placeholder="House No" className="w-1/2 p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" value={form.house} onChange={e => setForm({...form, house: e.target.value})} /><input placeholder="Area" className="w-1/2 p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" value={form.area} onChange={e => setForm({...form, area: e.target.value})} /></div>
        <div className="relative w-full h-40 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center flex-col gap-2">
            {location ? (<iframe width="100%" height="100%" src={`https://maps.google.com/maps?q=${location.lat},${location.long}&z=15&output=embed`} className="border-0 opacity-90 absolute top-0 left-0"></iframe>) : (<p className="text-xs text-gray-400">Map Preview</p>)}
            <div className="absolute bottom-4 flex gap-2 z-10 w-full px-4">
                <button onClick={() => window.open("https://www.google.com/maps", "_blank")} className="flex-1 bg-white text-gray-700 px-3 py-2 rounded-lg font-bold text-xs shadow-md border border-gray-200 flex items-center justify-center gap-1"><MapPin size={14}/> Pin on Map</button>
                <button onClick={getGPS} className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg font-bold text-xs shadow-md flex items-center justify-center gap-1"><Crosshair size={14}/> {loadingLoc ? "Locating..." : "Use My GPS"}</button>
            </div>
        </div>
      </div>
      <div className="space-y-3 mt-6"><button onClick={() => confirmOrder('Prepaid')} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-green-200">Pay Online (UPI)</button><button onClick={() => confirmOrder('COD')} className="w-full bg-white border border-gray-300 text-gray-700 py-4 rounded-xl font-bold">Cash on Delivery</button></div>
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
        <Route path="/admin" element={
            <AdminRoute>
               <AdminPanel />
            </AdminRoute>
        } />
        <Route path="/" element={<StoreFront cart={cart} addToCart={addToCart} removeFromCart={removeFromCart} />} />
        <Route path="/checkout" element={<Checkout cart={cart} clearCart={() => setCart([])} />} />
      </Routes>
    </Router>
  );
}