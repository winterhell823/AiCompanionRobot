import axios from 'axios';

export const backendBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export async function apiRequest({ url, method = 'GET', data = null, fallback = null }) {
  const liveUrl = `${backendBaseUrl}${url}`;

  try {
    const response = await axios({ url: liveUrl, method, data });
    return response.data;
  } catch (error) {
    if (fallback !== null) {
      return fallback;
    }

    throw new Error(error?.response?.data?.message || 'Backend integration required.');
  }
}
