export interface DistrictInfo {
  name: string;
  province: string;
}

export const SRI_LANKA_DISTRICTS: DistrictInfo[] = [
  { name: "Ampara", province: "Eastern" },
  { name: "Anuradhapura", province: "North Central" },
  { name: "Badulla", province: "Uva" },
  { name: "Batticaloa", province: "Eastern" },
  { name: "Colombo", province: "Western" },
  { name: "Galle", province: "Southern" },
  { name: "Gampaha", province: "Western" },
  { name: "Hambantota", province: "Southern" },
  { name: "Jaffna", province: "Northern" },
  { name: "Kalutara", province: "Western" },
  { name: "Kandy", province: "Central" },
  { name: "Kegalle", province: "Sabaragamuwa" },
  { name: "Kilinochchi", province: "Northern" },
  { name: "Kurunegala", province: "North Western" },
  { name: "Mannar", province: "Northern" },
  { name: "Matale", province: "Central" },
  { name: "Matara", province: "Southern" },
  { name: "Monaragala", province: "Uva" },
  { name: "Mullaitivu", province: "Northern" },
  { name: "Nuwara Eliya", province: "Central" },
  { name: "Polonnaruwa", province: "North Central" },
  { name: "Puttalam", province: "North Western" },
  { name: "Ratnapura", province: "Sabaragamuwa" },
  { name: "Trincomalee", province: "Eastern" },
  { name: "Vavuniya", province: "Northern" },
];

export const SRI_LANKA_PROVINCES = [
  "Central",
  "Eastern",
  "North Central",
  "Northern",
  "North Western",
  "Sabaragamuwa",
  "Southern",
  "Uva",
  "Western",
];

export function getProvinceForDistrict(districtName: string): string {
  const match = SRI_LANKA_DISTRICTS.find(
    (d) => d.name.toLowerCase() === districtName.trim().toLowerCase()
  );
  return match ? match.province : "Western";
}
