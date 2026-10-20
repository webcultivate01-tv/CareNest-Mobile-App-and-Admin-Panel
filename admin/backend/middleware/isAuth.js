import jwt from "jsonwebtoken";

const isAuth = async (req, res, next) => {
  try {
    const { token } = req.cookies;
    if (!token) {
      return res.status(400).json({ message: "Admin does not have token" });
    }

    const verifyToken = jwt.verify(token, process.env.JWT_SECRET);
    if (!verifyToken.adminId) {
      return res.status(400).json({ message: "Admin does not have a valid token" });
    }

    req.adminId = verifyToken.adminId;
    next();
  } catch (error) {
    return res.status(401).json({ message: `isAuth error ${error.message}` });
  }
};

export default isAuth;
