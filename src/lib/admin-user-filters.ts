type PhoneFilterableUser = {
  phone?: string;
};

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function filterAdminUsersByPhone<T extends PhoneFilterableUser>(
  users: readonly T[],
  query: string,
) {
  const digits = phoneDigits(query);
  if (!digits) return [...users];
  return users.filter((user) => phoneDigits(user.phone ?? "").includes(digits));
}
