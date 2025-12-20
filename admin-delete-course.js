/**
 * Admin Script: Delete Course Completely
 * 
 * Usage:
 * 1. Open the extension popup
 * 2. Right-click → Inspect → Console tab
 * 3. Copy and paste this entire script
 * 4. Call: await deleteCourse('COURSE_ID')
 * 
 * This will delete:
 * - All Gemini File Search documents and store
 * - All Firestore data (course, documents, sessions, messages)
 * - All user enrollments
 */

window.deleteCourse = async function(courseId) {
  try {
    console.log(`🗑️ Starting deletion of course: ${courseId}`);
    
    // Initialize
    const db = window.firebaseDb;
    const helpers = window.firestoreHelpers;
    const fileSearch = new window.GeminiFileSearchCloudClient(window.firebaseApp, null);
    
    // Get user ID
    const userInfo = await new Promise(resolve => {
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, resolve);
    });
    
    fileSearch.setUserId(userInfo.id);
    
    // Step 1: Get course data
    console.log('📋 Fetching course data...');
    const courseResult = await helpers.getCourse(db, courseId);
    
    if (!courseResult.success) {
      throw new Error(`Course not found: ${courseId}`);
    }
    
    const course = courseResult.data;
    const storeName = course.fileSearchStoreName;
    
    console.log('Course details:', {
      name: course.courseName,
      documents: course.documentCount || 0,
      enrollments: course.totalEnrollments || 0,
      store: storeName || 'none'
    });
    
    // Confirm deletion
    const confirm = window.confirm(
      `⚠️ WARNING: Delete "${course.courseName}"?\n\n` +
      `This will permanently delete:\n` +
      `- ${course.documentCount || 0} documents from Gemini File Search\n` +
      `- All chat sessions and messages\n` +
      `- All ${course.totalEnrollments || 0} user enrollments\n\n` +
      `This cannot be undone!`
    );
    
    if (!confirm) {
      console.log('❌ Deletion cancelled by user');
      return { success: false, cancelled: true };
    }
    
    // Step 2: Delete from Gemini File Search (via Cloud Function)
    if (storeName) {
      console.log('🗄️ Deleting File Search store (with all documents)...');
      try {
        // Use the fileSearch client which already has correct setup
        await fileSearch.deleteStore(storeName);
        console.log('✅ File Search store deleted');
      } catch (error) {
        console.warn('⚠️ Error deleting File Search store:', error.message);
        // Don't fail the whole operation if store deletion fails
      }
    } else {
      console.log('ℹ️ No File Search store to delete');
    }
    
    // Step 3: Delete from Firestore (cascade) via Cloud Function
    console.log('🗃️ Deleting course from Firestore...');
    
    // Use the fileSearch client's functions instance to call the Cloud Function
    // The GeminiFileSearchCloudClient already has the proper functions setup
    const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
    const functions = getFunctions(window.firebaseApp, 'europe-north1');
    const deleteCourseFunc = httpsCallable(functions, 'deleteCourseWithCascade');
    
    const deleteResult = await deleteCourseFunc({
      courseId: courseId,
      userId: userInfo.id
    });
    
    if (!deleteResult.data || !deleteResult.data.success) {
      throw new Error(`Firestore deletion failed: ${deleteResult.data?.error || 'Unknown error'}`);
    }
    
    const resultData = deleteResult.data;
    
    console.log('✅ COURSE COMPLETELY DELETED:', {
      courseId,
      deletedSessions: resultData.deletedSessions,
      deletedMessages: resultData.deletedMessages,
      deletedDocuments: resultData.deletedDocuments,
      deletedEnrollments: resultData.deletedEnrollments
    });
    
    return {
      success: true,
      courseId,
      courseName: course.courseName,
      ...resultData
    };
    
  } catch (error) {
    console.error('❌ ERROR DELETING COURSE:', error);
    return { success: false, error: error.message };
  }
};

// Helper function to list all courses
window.listAllCourses = async function() {
  const db = window.firebaseDb;
  const helpers = window.firestoreHelpers;
  
  const result = await helpers.getAllCourses(db);
  
  if (result.success) {
    const courses = result.data.map(c => ({
      'Course ID': c.id,
      'Name': c.courseName,
      'Code': c.courseCode || 'N/A',
      'Docs': c.documentCount || 0,
      'Users': c.totalEnrollments || 0,
      'Has Store': c.fileSearchStoreName ? '✅' : '❌'
    }));
    
    console.table(courses);
    return result.data;
  } else {
    console.error('Failed to load courses:', result.error);
    return [];
  }
};

console.log('✅ Admin deletion script loaded!');
console.log('');
console.log('Available commands:');
console.log('  listAllCourses()           - List all courses in database');
console.log('  deleteCourse("courseId")   - Delete a course completely');
console.log('');
console.log('Example:');
console.log('  await listAllCourses()');
console.log('  await deleteCourse("123456")');
