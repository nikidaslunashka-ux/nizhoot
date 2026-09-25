// Shared by the browser and server so registration, reset and change agree.
((root) => {
  const policy = {
    message: 'Gunakan huruf besar, huruf kecil, angka, dan simbol (maksimal 128 karakter).',
    isValid: password => typeof password === 'string' && password.length <= 128 &&
      /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[\p{P}\p{S}]/u.test(password)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  else root.NizhootPasswordPolicy = policy;
})(typeof window === 'undefined' ? globalThis : window);
