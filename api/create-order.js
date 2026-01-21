import Razorpay from 'razorpay';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Debugging: Log if keys are missing (Check Vercel Logs)
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("ERROR: Razorpay API Keys are missing in Vercel Environment Variables.");
    return res.status(500).json({ error: "Server Misconfiguration: Missing API Keys" });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  try {
    const { amount } = req.body;
    
    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "order_" + Date.now(),
    });

    res.status(200).json(order);
  } catch (error) {
    console.error("Razorpay Creation Error:", error);
    res.status(500).json({ error: error.message });
  }
}