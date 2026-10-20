import { useEffect } from "react";
import axios from "axios";
import { useDispatch } from "react-redux";
import { serverUrl } from "../App";
import { setAdminData, setAuthChecked } from "../redux/adminSlice";

const useGetCurrentAdmin = () => {
  const dispatch = useDispatch();
  useEffect(() => {
    const fetchAdmin = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/auth/getcurrentadmin", {
          withCredentials: true,
        });
        dispatch(setAdminData(result.data));
      } catch (error) {
        console.log(error);
        dispatch(setAdminData(null));
      } finally {
        dispatch(setAuthChecked(true));
      }
    };
    fetchAdmin();
  }, []);
};

export default useGetCurrentAdmin;
