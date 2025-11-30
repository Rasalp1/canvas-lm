// course-colors.js
// Centralized color management for courses

/**
 * Color palette for course assignments
 * Each color has gradient variants for different UI elements
 */
export const COURSE_COLORS = [
  {
    id: 'blue',
    name: 'Blue',
    gradient: 'from-blue-500 to-sky-500',
    bg: 'bg-blue-500',
    bgLight: 'bg-blue-100',
    text: 'text-blue-600',
    border: 'border-blue-500',
    hex: '#3B82F6'
  },
  {
    id: 'purple',
    name: 'Purple',
    gradient: 'from-purple-500 to-violet-500',
    bg: 'bg-purple-500',
    bgLight: 'bg-purple-100',
    text: 'text-purple-600',
    border: 'border-purple-500',
    hex: '#A855F7'
  },
  {
    id: 'pink',
    name: 'Pink',
    gradient: 'from-pink-500 to-rose-500',
    bg: 'bg-pink-500',
    bgLight: 'bg-pink-100',
    text: 'text-pink-600',
    border: 'border-pink-500',
    hex: '#EC4899'
  },
  {
    id: 'red',
    name: 'Red',
    gradient: 'from-red-500 to-orange-500',
    bg: 'bg-red-500',
    bgLight: 'bg-red-100',
    text: 'text-red-600',
    border: 'border-red-500',
    hex: '#EF4444'
  },
  {
    id: 'orange',
    name: 'Orange',
    gradient: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-500',
    bgLight: 'bg-orange-100',
    text: 'text-orange-600',
    border: 'border-orange-500',
    hex: '#F97316'
  },
  {
    id: 'amber',
    name: 'Amber',
    gradient: 'from-amber-500 to-yellow-500',
    bg: 'bg-amber-500',
    bgLight: 'bg-amber-100',
    text: 'text-amber-600',
    border: 'border-amber-500',
    hex: '#F59E0B'
  },
  {
    id: 'lime',
    name: 'Lime',
    gradient: 'from-lime-500 to-green-500',
    bg: 'bg-lime-500',
    bgLight: 'bg-lime-100',
    text: 'text-lime-600',
    border: 'border-lime-500',
    hex: '#84CC16'
  },
  {
    id: 'green',
    name: 'Green',
    gradient: 'from-green-500 to-emerald-500',
    bg: 'bg-green-500',
    bgLight: 'bg-green-100',
    text: 'text-green-600',
    border: 'border-green-500',
    hex: '#22C55E'
  },
  {
    id: 'teal',
    name: 'Teal',
    gradient: 'from-teal-500 to-cyan-500',
    bg: 'bg-teal-500',
    bgLight: 'bg-teal-100',
    text: 'text-teal-600',
    border: 'border-teal-500',
    hex: '#14B8A6'
  },
  {
    id: 'cyan',
    name: 'Cyan',
    gradient: 'from-cyan-500 to-blue-500',
    bg: 'bg-cyan-500',
    bgLight: 'bg-cyan-100',
    text: 'text-cyan-600',
    border: 'border-cyan-500',
    hex: '#06B6D4'
  },
  {
    id: 'indigo',
    name: 'Indigo',
    gradient: 'from-indigo-500 to-purple-500',
    bg: 'bg-indigo-500',
    bgLight: 'bg-indigo-100',
    text: 'text-indigo-600',
    border: 'border-indigo-500',
    hex: '#6366F1'
  },
  {
    id: 'violet',
    name: 'Violet',
    gradient: 'from-violet-500 to-fuchsia-500',
    bg: 'bg-violet-500',
    bgLight: 'bg-violet-100',
    text: 'text-violet-600',
    border: 'border-violet-500',
    hex: '#8B5CF6'
  },
  {
    id: 'fuchsia',
    name: 'Fuchsia',
    gradient: 'from-fuchsia-500 to-pink-500',
    bg: 'bg-fuchsia-500',
    bgLight: 'bg-fuchsia-100',
    text: 'text-fuchsia-600',
    border: 'border-fuchsia-500',
    hex: '#D946EF'
  },
  {
    id: 'rose',
    name: 'Rose',
    gradient: 'from-rose-500 to-red-500',
    bg: 'bg-rose-500',
    bgLight: 'bg-rose-100',
    text: 'text-rose-600',
    border: 'border-rose-500',
    hex: '#F43F5E'
  },
  {
    id: 'emerald',
    name: 'Emerald',
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-500',
    bgLight: 'bg-emerald-100',
    text: 'text-emerald-600',
    border: 'border-emerald-500',
    hex: '#10B981'
  }
];

/**
 * Get a color by ID
 * @param {string} colorId - Color ID
 * @returns {Object} Color object or default blue
 */
export function getColorById(colorId) {
  return COURSE_COLORS.find(c => c.id === colorId) || COURSE_COLORS[0];
}

/**
 * Assign a color to a course based on existing assignments
 * Uses round-robin distribution to ensure even color distribution
 * @param {Array} existingCourses - Array of existing courses with colorId
 * @returns {string} Color ID to assign
 */
export function assignCourseColor(existingCourses = []) {
  // Count how many times each color is used
  const colorUsage = {};
  COURSE_COLORS.forEach(color => {
    colorUsage[color.id] = 0;
  });
  
  existingCourses.forEach(course => {
    if (course.colorId && colorUsage[course.colorId] !== undefined) {
      colorUsage[course.colorId]++;
    }
  });
  
  // Find the least used color
  let minUsage = Infinity;
  let selectedColor = COURSE_COLORS[0].id;
  
  COURSE_COLORS.forEach(color => {
    if (colorUsage[color.id] < minUsage) {
      minUsage = colorUsage[color.id];
      selectedColor = color.id;
    }
  });
  
  return selectedColor;
}

/**
 * Get course color for display (returns color object)
 * Falls back to default blue if no color assigned
 * @param {Object} course - Course object with colorId
 * @returns {Object} Color object
 */
export function getCourseColor(course) {
  if (!course || !course.colorId) {
    return COURSE_COLORS[0]; // Default to blue
  }
  return getColorById(course.colorId);
}
