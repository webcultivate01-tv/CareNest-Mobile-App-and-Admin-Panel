import jwt from "jsonwebtoken";

// mobile app has no cookies, so the token is sent as "Authorization: Bearer <token>"
const isUserAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: "User does not have token" });
    }

    const verifyToken = jwt.verify(token, process.env.JWT_SECRET);
    if (!verifyToken.userId) {
      return res.status(401).json({ message: "User does not have a valid token" });
    }

    req.userId = verifyToken.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: `isUserAuth error ${error.message}` });
  }
};

export default isUserAuth;
