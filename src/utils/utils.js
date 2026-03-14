/**
 * Gets the current date as an ISO 8601 string.
 * 
 * @param {Date} [date=new Date()] - The date to format. Defaults to the current date.
 * @returns {string} The formatted date string.
 */
export function getDateAsIso8601(date = new Date()) {
  return date.toISOString().split('T')[0];
}

/**
 * Formats the location of a job based on the searched city.
 * 
 * @param {Object} job - The job object containing location information.
 * @param {string} searchedCity - The city that was searched for.
 * @returns {string} The formatted location string.
 */
export function formatLocation(job, searchedCity) {
  if (!Array.isArray(job.locations) || job.locations.length === 0) {
    return 'N/A';
  }

  const cities = job.locations
    .map(l => l.city)
    .filter(Boolean);

  if (!searchedCity) {
    return cities.join(', ');
  }

  const normalized = searchedCity.toLowerCase();
  const matched = cities.find(c => c.toLowerCase() === normalized);

  if (matched) {
    if (cities.length === 1) return matched;

    const others = cities.filter(c => c !== matched);
    return `${matched} (also: ${others.slice(0, 3).join(', ')}${others.length > 3 ? '…' : ''})`;
  }

  return cities.join(', ');
}
