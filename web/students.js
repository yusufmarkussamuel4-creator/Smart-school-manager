// ==========================================
// SMART SCHOOL MANAGER
// STUDENT MANAGEMENT SYSTEM
// ==========================================

const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

const PASSPORT_BUCKET = "student-passports";
const MAX_PHOTO_SIZE = 2 * 1024 * 1024;

const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

let currentSchoolId = null;
let registeredStudents = [];
let schoolClasses = [];
let selectedStudent = null;
let editingProfile = false;


// ==========================================
// PHOTO VALIDATION
// ==========================================

function validatePhoto(file) {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error("Use JPG, PNG or WEBP images only.");
    }

    if (file.size > MAX_PHOTO_SIZE) {
        throw new Error("Photograph must not exceed 2 MB.");
    }
}


// ==========================================
// PHOTO PREVIEW
// ==========================================

function previewPhoto(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    input.addEventListener("change", function () {

        const file = this.files[0];

        if (!file) {
            preview.removeAttribute("src");
            preview.style.display = "none";
            return;
        }

        try {
            validatePhoto(file);

            preview.src = URL.createObjectURL(file);
            preview.style.display = "block";

        } catch (error) {
            alert(error.message);

            this.value = "";
            preview.removeAttribute("src");
            preview.style.display = "none";
        }
    });
}


// ==========================================
// UPLOAD PASSPORT
// ==========================================

async function uploadPassport(file, studentId) {

    validatePhoto(file);

    const extension =
        file.type === "image/png" ? "png" :
        file.type === "image/webp" ? "webp" : "jpg";

    const filePath =
        `${currentSchoolId}/${studentId}.${extension}`;

    const { error } = await db.storage
        .from(PASSPORT_BUCKET)
        .upload(filePath, file, {
            upsert: true,
            contentType: file.type
        });

    if (error) throw error;

    return filePath;
}


// ==========================================
// GENERATE PRIVATE PHOTO URL
// ==========================================

async function getPassportUrl(filePath) {

    if (!filePath) return null;

    const { data, error } = await db.storage
        .from(PASSPORT_BUCKET)
        .createSignedUrl(filePath, 3600);

    if (error) {
        console.error("Passport URL error:", error);
        return null;
    }

    return data.signedUrl;
}


// ==========================================
// INITIALIZE STUDENT MANAGEMENT
// ==========================================

async function initializeStudents() {

    const message = document.getElementById("studentMessage");

    try {

        const { data: authData, error: authError } =
            await db.auth.getUser();

        if (authError || !authData.user) {
            window.location.href = "index.html";
            return;
        }

        const { data: memberships, error: membershipError } =
            await db
                .from("school_memberships")
                .select("school_id, role")
                .eq("user_id", authData.user.id)
                .eq("role", "school_admin");

        if (membershipError) throw membershipError;

        if (!memberships || memberships.length === 0) {
            throw new Error("No school administrator membership found.");
        }

        currentSchoolId = memberships[0].school_id;

        const { data: school, error: schoolError } = await db
            .from("schools")
            .select("id, approval_status")
            .eq("id", currentSchoolId)
            .single();

        if (schoolError) throw schoolError;

        if (school.approval_status !== "approved") {
            throw new Error("Your school has not been approved.");
        }

        await loadClasses();
        await loadStudents();

    } catch (error) {

        console.error(error);

        message.textContent = error.message;
        message.style.color = "red";
    }
}


// ==========================================
// LOAD SCHOOL CLASSES
// ==========================================

async function loadClasses() {

    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", currentSchoolId)
        .order("class_name");

    if (error) throw error;

    schoolClasses = data || [];

    const selects = [
        document.getElementById("classId"),
        document.getElementById("profileClass")
    ];

    selects.forEach(select => {

        select.innerHTML =
            '<option value="">Select Class</option>';

        schoolClasses.forEach(item => {

            const option = document.createElement("option");

            option.value = item.id;

            option.textContent =
                item.class_name +
                (item.arm ? " - " + item.arm : "");

            select.appendChild(option);
        });
    });
}


// ==========================================
// REGISTER PHOTO PREVIEW
// ==========================================

previewPhoto("passportPhoto", "passportPreview");


// ==========================================
// REGISTER NEW STUDENT
// ==========================================

document.getElementById("studentForm").addEventListener(
    "submit",
    async function(event) {

        event.preventDefault();

        const message = document.getElementById("studentMessage");
        const button = this.querySelector("button[type='submit']");

        button.disabled = true;
        button.textContent = "Registering...";

        let createdStudentId = null;
        let photoPath = null;

        try {

            const student = {

                school_id: currentSchoolId,

                admission_number:
                    document.getElementById("admissionNumber").value.trim(),

                first_name:
                    document.getElementById("firstName").value.trim(),

                middle_name:
                    document.getElementById("middleName").value.trim() || null,

                last_name:
                    document.getElementById("lastName").value.trim(),

                gender:
                    document.getElementById("gender").value || null,

                date_of_birth:
                    document.getElementById("dateOfBirth").value || null,

                guardian_name:
                    document.getElementById("guardianName").value.trim() || null,

                guardian_phone:
                    document.getElementById("guardianPhone").value.trim() || null,

                home_address:
                    document.getElementById("homeAddress").value.trim() || null
            };

            const classId =
                document.getElementById("classId").value;

            const session =
                document.getElementById("academicSession").value.trim();

            const term =
                document.getElementById("term").value;

            const photo =
                document.getElementById("passportPhoto").files[0];

            if (
                !student.admission_number ||
                !student.first_name ||
                !student.last_name
            ) {
                throw new Error("Complete the required student information.");
            }

            if (!classId || !session || !term) {
                throw new Error(
                    "Select class, academic session and term."
                );
            }

            if (photo) validatePhoto(photo);

            // Create student record

            const { data: newStudent, error: studentError } =
                await db
                    .from("students")
                    .insert(student)
                    .select("id")
                    .single();

            if (studentError) throw studentError;

            createdStudentId = newStudent.id;

            // Upload photograph

            if (photo) {

                photoPath = await uploadPassport(
                    photo,
                    createdStudentId
                );

                const { error: photoError } = await db
                    .from("students")
                    .update({
                        passport_url: photoPath
                    })
                    .eq("id", createdStudentId)
                    .eq("school_id", currentSchoolId);

                if (photoError) throw photoError;
            }

            // Create enrolment

            const { error: enrollmentError } = await db
                .from("student_enrollments")
                .insert({

                    school_id: currentSchoolId,
                    student_id: createdStudentId,
                    class_id: classId,
                    academic_session: session,
                    term: term

                });

            if (enrollmentError) throw enrollmentError;

            message.textContent =
                "Student registered successfully!";

            message.style.color = "green";

            this.reset();

            document.getElementById("passportPreview").style.display = "none";

            await loadStudents();

        } catch (error) {

            console.error(error);

            message.textContent = error.message;
            message.style.color = "red";

            // Clean up incomplete registration

            if (createdStudentId) {

                await db
                    .from("student_enrollments")
                    .delete()
                    .eq("student_id", createdStudentId)
                    .eq("school_id", currentSchoolId);

                await db
                    .from("students")
                    .delete()
                    .eq("id", createdStudentId)
                    .eq("school_id", currentSchoolId);

                if (photoPath) {

                    await db.storage
                        .from(PASSPORT_BUCKET)
                        .remove([photoPath]);
                }
            }

        } finally {

            button.disabled = false;
            button.textContent = "Register Student";
        }
    }
);


// ==========================================
// LOAD REGISTERED STUDENTS
// ==========================================

async function loadStudents() {

    const list = document.getElementById("studentList");

    list.innerHTML =
        '<tr><td colspan="4">Loading students...</td></tr>';

    try {

        const { data: students, error: studentError } = await db
            .from("students")
            .select("*")
            .eq("school_id", currentSchoolId)
            .order("created_at", { ascending: false });

        if (studentError) throw studentError;

        const { data: enrollments, error: enrollmentError } =
            await db
                .from("student_enrollments")
                .select("*")
                .eq("school_id", currentSchoolId)
                .order("created_at", { ascending: false });

        if (enrollmentError) throw enrollmentError;

        const enrollmentMap = new Map();

        enrollments.forEach(item => {

            if (!enrollmentMap.has(item.student_id)) {
                enrollmentMap.set(item.student_id, item);
            }
        });

        const classMap = new Map();

        schoolClasses.forEach(item => {

            classMap.set(
                item.id,
                item.class_name +
                (item.arm ? " - " + item.arm : "")
            );
        });

        registeredStudents = await Promise.all(

            students.map(async student => {

                const enrollment =
                    enrollmentMap.get(student.id);

                return {

                    ...student,

                    passportSignedUrl:
                        await getPassportUrl(student.passport_url),

                    enrollmentId:
                        enrollment ? enrollment.id : null,

                    classId:
                        enrollment ? enrollment.class_id : "",

                    className:
                        enrollment
                            ? classMap.get(enrollment.class_id) || "Class not found"
                            : "Not assigned",

                    academicSession:
                        enrollment ? enrollment.academic_session : "",

                    term:
                        enrollment ? enrollment.term : ""
                };
            })
        );

        displayStudents(registeredStudents);

    } catch (error) {

        console.error(error);

        list.innerHTML =
            `<tr><td colspan="4">Unable to load students: ${error.message}</td></tr>`;
    }
}


// ==========================================
// DISPLAY STUDENTS
// ==========================================

function displayStudents(students) {

    const list = document.getElementById("studentList");

    list.innerHTML = "";

    if (!students.length) {

        list.innerHTML =
            '<tr><td colspan="4">No students registered yet.</td></tr>';

        return;
    }

    students.forEach(student => {

        const row = document.createElement("tr");

        const admission = document.createElement("td");
        admission.textContent = student.admission_number;

        const name = document.createElement("td");

        name.textContent = [
            student.first_name,
            student.middle_name,
            student.last_name
        ].filter(Boolean).join(" ");

        const classCell = document.createElement("td");
        classCell.textContent = student.className;

        const actions = document.createElement("td");

        const viewButton = document.createElement("button");

        viewButton.textContent = "View Profile";
        viewButton.type = "button";

        viewButton.addEventListener(
            "click",
            () => openProfile(student.id)
        );

        const editButton = document.createElement("button");

        editButton.textContent = "Edit";
        editButton.type = "button";

        editButton.addEventListener(
            "click",
            () => openProfile(student.id, true)
        );

        const deleteButton = document.createElement("button");

        deleteButton.textContent = "Delete";
        deleteButton.type = "button";
        deleteButton.style.background = "#dc2626";

        deleteButton.addEventListener(
            "click",
            () => deleteStudent(student.id)
        );

        actions.append(
            viewButton,
            editButton,
            deleteButton
        );

        row.append(
            admission,
            name,
            classCell,
            actions
        );

        list.appendChild(row);
    });
}


// ==========================================
// OPEN STUDENT PROFILE
// ==========================================

function openProfile(studentId, editMode = false) {

    const student = registeredStudents.find(
        item => item.id === studentId
    );

    if (!student) return;

    selectedStudent = student;

    document.getElementById("profileStudentId").value =
        student.id;

    document.getElementById("profileEnrollmentId").value =
        student.enrollmentId || "";

    document.getElementById("profileAdmission").value =
        student.admission_number || "";

    document.getElementById("profileFirstName").value =
        student.first_name || "";

    document.getElementById("profileMiddleName").value =
        student.middle_name || "";

    document.getElementById("profileLastName").value =
        student.last_name || "";

    document.getElementById("profileGender").value =
        student.gender || "";

    document.getElementById("profileDOB").value =
        student.date_of_birth || "";

    document.getElementById("profileGuardian").value =
        student.guardian_name || "";

    document.getElementById("profilePhone").value =
        student.guardian_phone || "";

    document.getElementById("profileClass").value =
        student.classId || "";

    document.getElementById("profileSession").value =
        student.academicSession || "";

    document.getElementById("profileTerm").value =
        student.term || "";

    document.getElementById("profileAddress").value =
        student.home_address || "";

    document.getElementById("profileMessage").textContent = "";

    document.getElementById("profilePassportPhoto").value = "";

    const preview =
        document.getElementById("profilePassportPreview");

    if (student.passportSignedUrl) {

        preview.src = student.passportSignedUrl;
        preview.style.display = "block";

    } else {

        preview.removeAttribute("src");
        preview.style.display = "none";
    }

    document.getElementById("profileModal").style.display =
        "block";

    setProfileMode(editMode);
}


// ==========================================
// PROFILE PHOTO PREVIEW
// ==========================================

previewPhoto(
    "profilePassportPhoto",
    "profilePassportPreview"
);


// ==========================================
// PROFILE EDIT MODE
// ==========================================

function setProfileMode(editMode) {

    editingProfile = editMode;

    const form = document.getElementById("profileForm");

    form.querySelectorAll(
        "input:not([type='hidden']), select, textarea"
    ).forEach(field => {

        field.disabled = !editMode;
    });

    document.getElementById("profileTitle").textContent =
        editMode ? "Edit Student Information" : "Student Profile";

    document.getElementById("editProfileButton").style.display =
        editMode ? "none" : "inline-block";

    document.getElementById("saveProfileButton").style.display =
        editMode ? "inline-block" : "none";

    document.getElementById("cancelEditButton").style.display =
        editMode ? "inline-block" : "none";
}


// ==========================================
// EDIT PROFILE BUTTON
// ==========================================

document.getElementById("editProfileButton").addEventListener(
    "click",
    function() {

        setProfileMode(true);
    }
);


// ==========================================
// CANCEL PROFILE EDITING
// ==========================================

document.getElementById("cancelEditButton").addEventListener(
    "click",
    function() {

        if (selectedStudent) {
            openProfile(selectedStudent.id, false);
        }
    }
);


// ==========================================
// SAVE PROFILE CHANGES
// ==========================================

document.getElementById("profileForm").addEventListener(
    "submit",
    async function(event) {

        event.preventDefault();

        if (!editingProfile || !selectedStudent) return;

        const message =
            document.getElementById("profileMessage");

        const button =
            document.getElementById("saveProfileButton");

        button.disabled = true;
        button.textContent = "Saving...";

        try {

            const studentId =
                document.getElementById("profileStudentId").value;

            const updatedStudent = {

                first_name:
                    document.getElementById("profileFirstName").value.trim(),

                middle_name:
                    document.getElementById("profileMiddleName").value.trim() || null,

                last_name:
                    document.getElementById("profileLastName").value.trim(),

                gender:
                    document.getElementById("profileGender").value || null,

                date_of_birth:
                    document.getElementById("profileDOB").value || null,

                guardian_name:
                    document.getElementById("profileGuardian").value.trim() || null,

                guardian_phone:
                    document.getElementById("profilePhone").value.trim() || null,

                home_address:
                    document.getElementById("profileAddress").value.trim() || null
            };

            const classId =
                document.getElementById("profileClass").value;

            const session =
                document.getElementById("profileSession").value.trim();

            const term =
                document.getElementById("profileTerm").value;

            const photo =
                document.getElementById("profilePassportPhoto").files[0];

            if (!updatedStudent.first_name || !updatedStudent.last_name) {
                throw new Error(
                    "First name and last name are required."
                );
            }

            if (!classId || !session || !term) {
                throw new Error(
                    "Select class, academic session and term."
                );
            }

            if (photo) validatePhoto(photo);

            const oldPhotoPath = selectedStudent.passport_url;

            let newPhotoPath = oldPhotoPath;

            if (photo) {

                newPhotoPath = await uploadPassport(
                    photo,
                    studentId
                );

                updatedStudent.passport_url = newPhotoPath;
            }

            // Update student record

            const { error: updateError } = await db
                .from("students")
                .update(updatedStudent)
                .eq("id", studentId)
                .eq("school_id", currentSchoolId);

            if (updateError) throw updateError;

            // Update or create enrolment

            const enrollmentId =
                document.getElementById("profileEnrollmentId").value;

            const enrollmentData = {

                school_id: currentSchoolId,
                student_id: studentId,
                class_id: classId,
                academic_session: session,
                term: term
            };

            if (enrollmentId) {

                const { error: enrollmentError } = await db
                    .from("student_enrollments")
                    .update(enrollmentData)
                    .eq("id", enrollmentId)
                    .eq("school_id", currentSchoolId);

                if (enrollmentError) throw enrollmentError;

            } else {

                const { error: enrollmentError } = await db
                    .from("student_enrollments")
                    .insert(enrollmentData);

                if (enrollmentError) throw enrollmentError;
            }

            // Remove old photo if its path changed

            if (
                photo &&
                oldPhotoPath &&
                oldPhotoPath !== newPhotoPath
            ) {

                const { error: removalError } = await db.storage
                    .from(PASSPORT_BUCKET)
                    .remove([oldPhotoPath]);

                if (removalError) {
                    console.warn("Old photograph cleanup failed:", removalError);
                }
            }

            message.textContent =
                "Student information updated successfully!";

            message.style.color = "green";

            await loadStudents();

            const updated = registeredStudents.find(
                item => item.id === studentId
            );

            if (updated) {

                selectedStudent = updated;

                openProfile(studentId, false);

                document.getElementById("profileMessage").textContent =
                    "Changes saved successfully!";

                document.getElementById("profileMessage").style.color =
                    "green";
            }

        } catch (error) {

            console.error(error);

            message.textContent = error.message;
            message.style.color = "red";

        } finally {

            button.disabled = false;
            button.textContent = "Save Changes";
        }
    }
);


// ==========================================
// DELETE STUDENT
// ==========================================

async function deleteStudent(studentId) {

    const student = registeredStudents.find(
        item => item.id === studentId
    );

    if (!student) {

        alert("Student record not found.");
        return;
    }

    const studentName = [
        student.first_name,
        student.middle_name,
        student.last_name
    ].filter(Boolean).join(" ");

    const confirmed = confirm(

        `Are you sure you want to delete ${studentName}?\n\n` +

        "This will permanently delete the student record " +
        "and associated enrolment records.\n\n" +

        "This action cannot be undone."
    );

    if (!confirmed) return;

    try {

        // Delete enrolment records first

        const { error: enrollmentError } = await db
            .from("student_enrollments")
            .delete()
            .eq("student_id", studentId)
            .eq("school_id", currentSchoolId);

        if (enrollmentError) throw enrollmentError;

        // Delete student record

        const { error: studentError } = await db
            .from("students")
            .delete()
            .eq("id", studentId)
            .eq("school_id", currentSchoolId);

        if (studentError) throw studentError;

        // Remove passport photograph after record deletion

        let photoWarning = "";

        if (student.passport_url) {

            const { error: photoError } = await db.storage
                .from(PASSPORT_BUCKET)
                .remove([student.passport_url]);

            if (photoError) {

                console.warn(
                    "Passport cleanup failed:",
                    photoError
                );

                photoWarning =
                    "\nThe student was deleted, but the passport photograph could not be removed automatically.";
            }
        }

        alert(
            "Student deleted successfully." + photoWarning
        );

        await loadStudents();

    } catch (error) {

        console.error("Student deletion error:", error);

        alert(
            "Unable to delete student: " + error.message
        );
    }
}


// ==========================================
// SEARCH STUDENTS
// ==========================================

document.getElementById("studentSearch").addEventListener(
    "input",
    function() {

        const search = this.value.trim().toLowerCase();

        const filtered = registeredStudents.filter(student => {

            const name = [

                student.first_name,
                student.middle_name,
                student.last_name

            ].filter(Boolean).join(" ").toLowerCase();

            return (

                name.includes(search) ||

                student.admission_number
                    .toLowerCase()
                    .includes(search) ||

                student.className
                    .toLowerCase()
                    .includes(search)
            );
        });

        displayStudents(filtered);
    }
);


// ==========================================
// LOGOUT
// ==========================================

async function logoutStudentManagement() {

    await db.auth.signOut();

    window.location.href = "index.html";
}


// ==========================================
// START APPLICATION
// ==========================================

initializeStudents();
