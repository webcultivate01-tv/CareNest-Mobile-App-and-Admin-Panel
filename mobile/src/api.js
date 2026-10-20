// Talks to the CareNest backend (admin/backend).
// The server address comes from .env (EXPO_PUBLIC_API_URL). On a real phone use your
// computer's Wi-Fi IP (not localhost). Android emulator: http://10.0.2.2:5000
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const TOKEN_KEY = 'carenest_token';

// Saved login token (kept safely on the phone, so the user stays signed in).
export const saveToken = (token) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const getToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

// Sends a request and returns the JSON. Throws an Error with the server's message.
// `body` can be a plain object (sent as JSON) or FormData (for file uploads).
async function request(path, { method = 'GET', body, token } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check your internet connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}

// Both return { token, user }.
export const signUpUser = (form) =>
  request('/api/user/signup', {
    method: 'POST',
    body: {
      name: form.name.trim(),
      mobile: form.mobile,
      dob: form.dob,
      email: form.email.trim(),
      password: form.password,
    },
  });

export const loginUser = (id, password) =>
  request('/api/user/login', { method: 'POST', body: { id, password } });

// Returns the user for a saved token (used when the app opens).
export const getCurrentUser = (token) => request('/api/user/getcurrentuser', { token });

// The three below return { user } with the updated details (email can not be changed).
export const updateProfile = (token, form) =>
  request('/api/user/profile', {
    method: 'PUT',
    token,
    body: { name: form.name.trim(), mobile: form.mobile, dob: form.dob },
  });

// Sends FormData with XMLHttpRequest. Expo's fetch (SDK 57) can not send a
// { uri, name, type } file part, but React Native's XMLHttpRequest can.
function uploadForm(path, data, token) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL + path);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.message || 'Something went wrong'));
    };
    xhr.onerror = () => reject(new Error('Cannot reach the server. Check your internet connection.'));
    xhr.send(data);
  });
}

// image = result from the image picker ({ uri, mimeType, file })
export const uploadPhoto = async (token, image) => {
  const type = image.mimeType || 'image/jpeg';
  const name = 'photo.' + (type === 'image/png' ? 'png' : 'jpg');
  const data = new FormData();
  if (Platform.OS === 'web') {
    // the browser's FormData needs a real Blob/File, not a { uri } object
    const blob = image.file || (await (await fetch(image.uri)).blob());
    data.append('photo', blob, name);
    return request('/api/user/photo', { method: 'POST', token, body: data });
  }
  data.append('photo', { uri: image.uri, name, type });
  return uploadForm('/api/user/photo', data, token);
};

export const deletePhoto = (token) => request('/api/user/photo', { method: 'DELETE', token });

// ---- doctors + booking (only active doctors are returned) ----

// [{ id, name, specialty, qualifications, experienceYears, fee, photo, freeToday, schedule }]
export const getDoctors = (token) => request('/api/user/doctors', { token });

// { doctor, days: [{ date, freeSlots }] }
export const getDoctorDays = (token, doctorId) => request(`/api/user/doctordays/${doctorId}`, { token });

// { doctor, date, slots: [{ time, startsAt }] }
export const getDoctorSlots = (token, doctorId, date) =>
  request(`/api/user/doctorslots/${doctorId}?date=${date}`, { token });

// scheduledAt = the startsAt of a slot
export const bookAppointment = (token, doctorId, scheduledAt, notes) =>
  request('/api/user/bookappointment', { method: 'POST', token, body: { doctorId, scheduledAt, notes } });
