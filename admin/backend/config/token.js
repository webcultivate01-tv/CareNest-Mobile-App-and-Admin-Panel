import jwt from "jsonwebtoken";

export const genToken = (adminId) => {
  return jwt.sign({ adminId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// token for a mobile app user (patient)
export const genUserToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
};
