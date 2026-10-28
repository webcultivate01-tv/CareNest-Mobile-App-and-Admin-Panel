import {
  countUnreadNotifications,
  deleteNotification,
  findNotificationsByPatient,
  markAllNotificationsRead,
  markNotificationRead,
} from "../model/notificationModel.js";
import { markAppMessagesRead } from "../model/campaignModel.js";

// Marketing messages sent to the app inbox show blue ticks in the admin panel once read. That is
// bookkeeping only: it must never make the patient's own request fail.
const markCampaignTicks = (ids) =>
  markAppMessagesRead(ids).catch((error) => console.log(`Campaign read tick error ${error.message}`));

// The patient inbox behind the bell icon in the mobile app. Every route here is mounted under
// isUserAuth and only ever touches req.userId, so a patient can only read and change their own
// notifications - the id in the URL is matched against their own id in the SQL itself.

const sendError = (res, name, error) => res.status(500).json({ message: `${name} error ${error.message}` });

const isValidId = (value) => /^\d+$/.test(String(value));

// { notifications: [...], unread: n }
export const getMyNotifications = async (req, res) => {
  try {
    const [notifications, unread] = await Promise.all([
      findNotificationsByPatient(req.userId, { limit: req.query.limit, offset: req.query.offset }),
      countUnreadNotifications(req.userId),
    ]);
    return res.status(200).json({ notifications, unread });
  } catch (error) {
    return sendError(res, "GetMyNotifications", error);
  }
};

// the bell badge polls this one, so it stays as small as possible
export const getUnreadCount = async (req, res) => {
  try {
    return res.status(200).json({ unread: await countUnreadNotifications(req.userId) });
  } catch (error) {
    return sendError(res, "GetUnreadCount", error);
  }
};

export const readNotification = async (req, res) => {
  try {
    if (!isValidId(req.params.notificationId)) {
      return res.status(404).json({ message: "Notification is not found" });
    }
    // already-read rows return no row; that is not an error, the end state is the same
    const marked = await markNotificationRead(req.userId, req.params.notificationId);
    if (marked) await markCampaignTicks([marked.id]);
    return res.status(200).json({ message: "Notification read", unread: await countUnreadNotifications(req.userId) });
  } catch (error) {
    return sendError(res, "ReadNotification", error);
  }
};

export const readAllNotifications = async (req, res) => {
  try {
    const ids = await markAllNotificationsRead(req.userId);
    await markCampaignTicks(ids);
    return res.status(200).json({ message: `${ids.length} notification(s) marked as read`, unread: 0 });
  } catch (error) {
    return sendError(res, "ReadAllNotifications", error);
  }
};

export const removeNotification = async (req, res) => {
  try {
    if (!isValidId(req.params.notificationId)) {
      return res.status(404).json({ message: "Notification is not found" });
    }
    const removed = await deleteNotification(req.userId, req.params.notificationId);
    if (!removed) {
      return res.status(404).json({ message: "Notification is not found" });
    }
    return res.status(200).json({ message: "Notification removed", unread: await countUnreadNotifications(req.userId) });
  } catch (error) {
    return sendError(res, "RemoveNotification", error);
  }
};
