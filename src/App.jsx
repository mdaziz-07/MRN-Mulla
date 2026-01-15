import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { db } from './firebase';
import { collection, addDoc, onSnapshot, updateDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ShoppingCart, MapPin, Plus, Check, Truck, Package, Menu, X, Home } from 'lucide-react';

// --- ADMIN PANEL (Same as before) ---
function AdminPanel() {
  const [product, setProduct] = useState({ name: '', price: '', category: '', imageUrl: '' });
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('orders');

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!product.name || !product.price || !product.imageUrl || !product.category) return alert("Fill all details");
    await addDoc(collection(db, "products"), { ...product, price: Number(product.price), createdAt: serverTimestamp() });
    alert("Item Added!");
    setProduct({ name: '', price: '', category: '', imageUrl: '' });
  };

  const advanceStatus = async (order) => {
    let newStatus = order.status === "Received" ? "Out for Delivery" : order.status === "Out for Delivery" ? "Delivered" : "";
    if (newStatus) await updateDoc(doc(db, "orders", order.id), { status: newStatus });
  };

  return (
    <div className="bg-gray-100 min-h-screen pb-20">
      <div className="bg-blue-800 text-white p-4 sticky top-0 z-10 shadow-md">
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-4 mt-2 text-sm">
          <button onClick={() => setActiveTab('orders')} className={`pb-1 ${activeTab === 'orders' ? 'border-b-2 font-bold' : 'opacity-70'}`}>Orders</button>
          <button onClick={() => setActiveTab('add')} className={`pb-1 ${activeTab === 'add' ? 'border-b-2 font-bold' : 'opacity-70'}`}>Add Items</button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {activeTab === 'add' ? (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Plus size={20}/> Add Product</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500">CATEGORY NAME</label>
                <input placeholder="Type Category (e.g. Atta, Soaps)" className="w-full p-3 border rounded mt-1" value={product.category} onChange={e => setProduct({...product, category: e.target.value})} />
              </div>
              <input placeholder="Product Name" className="w-full p-3 border rounded" value={product.name} onChange={e => setProduct({...product, name: e.target.value})} />
              <input type="number" placeholder="Price (₹)" className="w-full p-3 border rounded" value={product.price} onChange={e => setProduct({...product, price: e.target.value})} />
              <input placeholder="Image Link (https://...)" className="w-full p-3 border rounded" value={product.imageUrl} onChange={e => setProduct({...product, imageUrl: e.target.value})} />
              {product.imageUrl && <img src={product.imageUrl} className="h-20 w-20 object-contain mx-auto border rounded" />}
              <button className="w-full bg-blue-600 text-white py-3 rounded font-bold shadow hover:bg-blue-700">Add to Shop</button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <div key={order.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className={`p-3 flex justify-between items-center border-b ${order.status === 'Delivered' ? 'bg-green-100' : 'bg-blue-50'}`}>
                  <div><h3 className="font-bold text-gray-800">{order.customerName}</h3><span className="text-xs font-bold">{order.status}</span></div>
                  <a href={`tel:${order.mobile}`} className="bg-white p-2 rounded-full shadow-sm text-blue-600"><Package size={16}/></a>
                </div>
                <div className="p-3 text-sm">
                   <p className="text-gray-600 mb-2">{order.address}</p>
                   <a href={`https://www.google.com/maps?q=${order.location?.lat},${order.location?.long}`} target="_blank" rel="noreferrer" className="text-blue-500 underline flex items-center gap-1 mb-3"><MapPin size={14}/> Open Exact Location</a>
                   <div className="bg-gray-50 p-2 rounded mb-3">
                     {order.items.map((item, i) => (<div key={i} className="flex justify-between py-1 border-b border-gray-200 last:border-0"><span>{item.qty} x {item.name}</span><span className="font-bold">₹{item.price * item.qty}</span></div>))}
                     <div className="flex justify-between font-bold mt-2 pt-2 text-base"><span>Total ({order.paymentMethod})</span><span>₹{order.total}</span></div>
                   </div>
                   {order.status !== 'Delivered' ? (
                     <button onClick={() => advanceStatus(order)} className={`w-full py-3 rounded text-white font-bold flex justify-center items-center gap-2 ${order.status === 'Received' ? 'bg-orange-500' : 'bg-green-600'}`}>
                       {order.status === 'Received' ? <><Truck size={18}/> Mark Out for Delivery</> : <><Check size={18}/> Mark Delivered</>}
                     </button>
                   ) : (<div className="w-full py-2 bg-gray-200 text-gray-500 text-center font-bold rounded flex justify-center items-center gap-2"><Check size={16}/> Order Completed</div>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- STORE FRONT (With Hamburger Menu) ---
function StoreFront({ cart, addToCart, removeFromCart }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [activeCategory, setActiveCategory] = useState('All');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "products"));
    onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(prods);
      setCategories(['All', ...new Set(prods.map(p => p.category))]);
    });
  }, []);

  const filtered = activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory);
  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);
  const getQty = (id) => cart.find(x => x.id === id)?.qty || 0;

  return (
    <div className="bg-gray-50 min-h-screen pb-24">
      {/* Header */}
      <div className="bg-white p-3 sticky top-0 z-10 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMenuOpen(true)} className="p-2 -ml-2 hover:bg-gray-100 rounded-full"><Menu size={24} /></button>
          <div><h1 className="text-xl font-extrabold text-green-700">KGN Store</h1><p className="text-[10px] text-gray-500">Fast Home Delivery</p></div>
        </div>
        {cartCount > 0 && <div onClick={() => navigate('/checkout')} className="bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 text-sm"><ShoppingCart size={16}/> {cartCount}</div>}
      </div>

      {/* Hamburger Sidebar */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="bg-black bg-opacity-50 w-full absolute h-full" onClick={() => setIsMenuOpen(false)}></div>
          <div className="bg-white w-64 h-full relative z-10 p-4 shadow-xl overflow-y-auto">
             <div className="flex justify-between items-center mb-6">
                <h2 className="font-bold text-lg text-green-700">Categories</h2>
                <button onClick={() => setIsMenuOpen(false)}><X size={24} /></button>
             </div>
             <div className="space-y-2">
                {categories.map(cat => (
                  <button key={cat} onClick={() => { setActiveCategory(cat); setIsMenuOpen(false); }} 
                    className={`w-full text-left px-4 py-3 rounded-lg font-medium ${activeCategory === cat ? 'bg-green-100 text-green-800' : 'text-gray-700 hover:bg-gray-50'}`}>
                    {cat}
                  </button>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* Category Label (To show what is selected) */}
      <div className="px-4 py-2 bg-white border-b flex items-center gap-2">
         <span className="text-xs font-bold text-gray-400">SHOWING:</span>
         <span className="text-sm font-bold text-green-700">{activeCategory}</span>
      </div>

      {/* Grid */}
      <div className="p-2 grid grid-cols-2 md:grid-cols-4 gap-2">
        {filtered.map(p => (
          <div key={p.id} className="bg-white p-2 rounded-lg shadow-sm border border-gray-100 flex flex-col justify-between">
            <div className="h-24 flex items-center justify-center bg-gray-50 rounded mb-2 overflow-hidden">
              <img src={p.imageUrl} onError={(e) => e.target.src = 'https://via.placeholder.com/150'} alt={p.name} className="h-full w-full object-contain" />
            </div>
            <h3 className="font-bold text-xs text-gray-800 leading-tight mb-1 line-clamp-2 min-h-[2.5em]">{p.name}</h3>
            <div className="flex flex-col gap-2 mt-auto">
              <span className="font-bold text-sm text-black">₹{p.price}</span>
              {getQty(p.id) === 0 ? (
                <button onClick={() => addToCart(p)} className="w-full bg-white text-green-700 border border-green-600 py-1 rounded-md text-xs font-bold uppercase hover:bg-green-50">ADD</button>
              ) : (
                <div className="flex items-center justify-between bg-green-600 text-white rounded-md h-7 w-full">
                  <button onClick={() => removeFromCart(p)} className="w-8 h-full flex items-center justify-center font-bold text-lg">-</button>
                  <span className="text-xs font-bold">{getQty(p.id)}</span>
                  <button onClick={() => addToCart(p)} className="w-8 h-full flex items-center justify-center font-bold text-lg">+</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Floating Cart */}
      {cartCount > 0 && (
        <div onClick={() => navigate('/checkout')} className="fixed bottom-4 left-3 right-3 bg-green-700 text-white p-3 rounded-xl shadow-2xl flex justify-between items-center cursor-pointer transform active:scale-95 transition-all">
           <div className="flex flex-col">
             <span className="text-[10px] uppercase text-green-200 font-bold">{cartCount} ITEMS</span>
             <span className="font-bold text-lg leading-none">₹{cart.reduce((sum, i) => sum + (i.price * i.qty), 0)}</span>
           </div>
           <span className="flex items-center gap-1 bg-white text-green-800 px-3 py-1.5 rounded-lg text-sm font-bold">View Cart <ShoppingCart size={14}/></span>
        </div>
      )}
    </div>
  );
}

// --- CHECKOUT (Fixed GPS) ---
function Checkout({ cart, clearCart }) {
  const [form, setForm] = useState({ name: '', mobile: '', house: '', area: '' });
  const [location, setLocation] = useState(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const navigate = useNavigate();
  const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

  const getGPS = () => {
    setLoadingLoc(true);
    if (!("geolocation" in navigator)) { alert("GPS not supported"); return setLoadingLoc(false); }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, long: pos.coords.longitude });
        setLoadingLoc(false);
      },
      (error) => {
        setLoadingLoc(false);
        // Better Error Messages
        if (error.code === 1) alert("Location Permission Denied. Please enable Location in Browser Settings.");
        else if (error.code === 2) alert("Location unavailable. Make sure GPS is On.");
        else alert("Error fetching location. If you are on Mobile, you MUST use HTTPS (Deploy the app) for GPS to work.");
      },
      { enableHighAccuracy: true }
    );
  };

  const confirmOrder = async (method) => {
    if (!form.name || !form.mobile || !location) return alert("Please fill Name, Mobile & Click 'Get Location'");
    await addDoc(collection(db, "orders"), {
      customerName: form.name, mobile: form.mobile, address: `${form.house}, ${form.area}`,
      location, items: cart, total, paymentMethod: method, status: 'Received', timestamp: serverTimestamp()
    });
    alert("Order Placed Successfully!"); clearCart(); navigate('/');
  };

  if (cart.length === 0) return <div className="p-10 text-center text-gray-500">Cart is empty <br/><button onClick={() => navigate('/')} className="text-blue-500 mt-4 underline">Go Shop</button></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
        <h2 className="font-bold text-lg mb-2">Order Summary</h2>
        {cart.map(item => <div key={item.id} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0"><span>{item.qty} x {item.name}</span><span>₹{item.price * item.qty}</span></div>)}
        <div className="flex justify-between font-bold text-lg mt-3 pt-2 border-t"><span>To Pay</span><span>₹{total}</span></div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm mb-4 space-y-3">
        <h2 className="font-bold text-sm text-gray-500 uppercase">Delivery Details</h2>
        <input placeholder="Your Name" className="w-full p-3 border rounded bg-gray-50 text-sm" onChange={e => setForm({...form, name: e.target.value})} />
        <input placeholder="Mobile Number" type="number" className="w-full p-3 border rounded bg-gray-50 text-sm" onChange={e => setForm({...form, mobile: e.target.value})} />
        <input placeholder="House No / Flat" className="w-full p-3 border rounded bg-gray-50 text-sm" onChange={e => setForm({...form, house: e.target.value})} />
        <input placeholder="Area / Landmark" className="w-full p-3 border rounded bg-gray-50 text-sm" onChange={e => setForm({...form, area: e.target.value})} />
        <button onClick={getGPS} className={`w-full py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition-all ${location ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-blue-100 text-blue-700'}`}>
          <MapPin size={18}/> {loadingLoc ? "Finding..." : location ? "Location Saved ✅" : "Get Exact GPS Location"}
        </button>
      </div>
      <div className="space-y-3">
        <button onClick={() => confirmOrder('Prepaid')} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-lg">Pay Online (UPI)</button>
        <button onClick={() => confirmOrder('COD')} className="w-full bg-white border-2 border-gray-800 text-gray-800 py-3.5 rounded-xl font-bold">Cash on Delivery</button>
      </div>
    </div>
  );
}

// --- MAIN APP ---
export default function App() {
  const [cart, setCart] = useState([]);
  const addToCart = (p) => setCart(prev => { const ex = prev.find(x => x.id === p.id); return ex ? prev.map(x => x.id === p.id ? {...x, qty: x.qty + 1} : x) : [...prev, {...p, qty: 1}]; });
  const removeFromCart = (p) => setCart(prev => { const ex = prev.find(x => x.id === p.id); return ex.qty === 1 ? prev.filter(x => x.id !== p.id) : prev.map(x => x.id === p.id ? {...x, qty: x.qty - 1} : x); });

  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/" element={<StoreFront cart={cart} addToCart={addToCart} removeFromCart={removeFromCart} />} />
        <Route path="/checkout" element={<Checkout cart={cart} clearCart={() => setCart([])} />} />
      </Routes>
    </Router>
  );
}