import { useSelector } from "react-redux";

function Dashboard() {
  const { statsData } = useSelector((state) => state.dashboard);
  const { adminData } = useSelector((state) => state.admin);

  const cards = [
    { label: "Doctors", value: statsData?.doctors },
    { label: "Patients", value: statsData?.patients },
    { label: "Total Appointments", value: statsData?.appointments },
    { label: "Pending Appointments", value: statsData?.pending },
    { label: "Today's Appointments", value: statsData?.today },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome, {adminData?.name}</h1>
      <p className="text-gray-500 mb-6">Overview of CareNest</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value ?? "-"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
