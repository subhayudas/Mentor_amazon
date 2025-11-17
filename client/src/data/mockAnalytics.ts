export const MOCK_ANALYTICS_DATA = {
  kpis: {
    total_bookings: 247,
    completed_meetings: 189,
    canceled_meetings: 23,
    upcoming_meetings: 35,
    unique_mentees: 94,
    unique_mentors: 18,
    conversion_rate: 0.68,
    avg_rating: 4.7,
    total_ratings: 156
  },
  
  bookings_over_time: [
    { date: '2024-08-26', week: 'Week 1', clicks: 15, bookings: 8, completed: 6, canceled: 2 },
    { date: '2024-09-02', week: 'Week 2', clicks: 22, bookings: 14, completed: 12, canceled: 1 },
    { date: '2024-09-09', week: 'Week 3', clicks: 18, bookings: 12, completed: 10, canceled: 2 },
    { date: '2024-09-16', week: 'Week 4', clicks: 28, bookings: 19, completed: 15, canceled: 3 },
    { date: '2024-09-23', week: 'Week 5', clicks: 31, bookings: 22, completed: 18, canceled: 2 },
    { date: '2024-09-30', week: 'Week 6', clicks: 26, bookings: 18, completed: 16, canceled: 1 },
    { date: '2024-10-07', week: 'Week 7', clicks: 35, bookings: 24, completed: 19, canceled: 4 },
    { date: '2024-10-14', week: 'Week 8', clicks: 29, bookings: 21, completed: 18, canceled: 2 },
    { date: '2024-10-21', week: 'Week 9', clicks: 33, bookings: 25, completed: 21, canceled: 2 },
    { date: '2024-10-28', week: 'Week 10', clicks: 40, bookings: 29, completed: 24, canceled: 3 },
    { date: '2024-11-04', week: 'Week 11', clicks: 37, bookings: 28, completed: 23, canceled: 2 },
    { date: '2024-11-11', week: 'Week 12', clicks: 43, bookings: 27, completed: 22, canceled: 1 }
  ],
  
  top_mentors: [
    { mentor_name: 'Ahmed Hassan', booking_count: 35, avg_rating: 4.9, total_ratings: 28, expertise: 'Product Management' },
    { mentor_name: 'Layla Mahmoud', booking_count: 32, avg_rating: 4.8, total_ratings: 26, expertise: 'Engineering Leadership' },
    { mentor_name: 'Karim Nasser', booking_count: 28, avg_rating: 4.7, total_ratings: 22, expertise: 'Machine Learning' },
    { mentor_name: 'Fatima Al-Rashid', booking_count: 25, avg_rating: 4.8, total_ratings: 20, expertise: 'Digital Marketing' },
    { mentor_name: 'Omar Khalil', booking_count: 23, avg_rating: 4.6, total_ratings: 19, expertise: 'UX Design' },
    { mentor_name: 'Nour Ibrahim', booking_count: 20, avg_rating: 4.7, total_ratings: 16, expertise: 'Operations Management' },
    { mentor_name: 'Youssef Fahmy', booking_count: 18, avg_rating: 4.5, total_ratings: 14, expertise: 'Business Analysis' }
  ],
  
  specialization_distribution: [
    { name: 'Product Management', value: 45, color: '#FF9900' },
    { name: 'Engineering & Cloud', value: 58, color: '#232F3E' },
    { name: 'Data Science & ML', value: 38, color: '#5B6EE1' },
    { name: 'Marketing & Growth', value: 35, color: '#26B5A8' },
    { name: 'UX & Design', value: 32, color: '#EF4444' },
    { name: 'Operations', value: 25, color: '#8B5CF6' },
    { name: 'Business Analytics', value: 14, color: '#F59E0B' }
  ],
  
  language_distribution: [
    { name: 'English', value: 247, color: '#232F3E' },
    { name: 'Arabic', value: 189, color: '#FF9900' },
    { name: 'French', value: 32, color: '#5B6EE1' }
  ],
  
  mentee_type_distribution: [
    { name: 'Individual', value: 156, color: '#26B5A8' },
    { name: 'Organization', value: 91, color: '#EF4444' }
  ],

  recent_bookings: [
    { id: '1', mentor_name: 'Ahmed Hassan', mentee_name: 'Sara Mohamed', status: 'completed', booked_at: '2024-11-10T14:30:00Z', expertise: 'Product Management' },
    { id: '2', mentor_name: 'Layla Mahmoud', mentee_name: 'Khaled Ali', status: 'scheduled', booked_at: '2024-11-15T10:00:00Z', expertise: 'Cloud Computing' },
    { id: '3', mentor_name: 'Karim Nasser', mentee_name: 'Amira Hassan', status: 'completed', booked_at: '2024-11-09T16:00:00Z', expertise: 'Machine Learning' },
    { id: '4', mentor_name: 'Omar Khalil', mentee_name: 'Yousef Ibrahim', status: 'canceled', booked_at: '2024-11-08T11:30:00Z', expertise: 'UX Design' },
    { id: '5', mentor_name: 'Fatima Al-Rashid', mentee_name: 'Mariam Farah', status: 'completed', booked_at: '2024-11-12T15:00:00Z', expertise: 'Digital Marketing' },
    { id: '6', mentor_name: 'Nour Ibrahim', mentee_name: 'Omar Khalil', status: 'scheduled', booked_at: '2024-11-18T09:00:00Z', expertise: 'Operations' },
    { id: '7', mentor_name: 'Ahmed Hassan', mentee_name: 'Layla Nasser', status: 'completed', booked_at: '2024-11-11T13:00:00Z', expertise: 'Product Management' },
    { id: '8', mentor_name: 'Karim Nasser', mentee_name: 'Fatima Zayed', status: 'completed', booked_at: '2024-11-13T14:30:00Z', expertise: 'Data Science' }
  ]
};
