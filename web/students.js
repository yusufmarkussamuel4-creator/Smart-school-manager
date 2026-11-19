const db = window.supabase.createClient(
    window.SUPABASE_CONFIG.URL,
    window.SUPABASE_CONFIG.KEY
);

let currentSchoolId = null;
let registeredStudents = [];

async function initializeStudents() {
    const message = document.getElementById("studentMessage");

    try {
        // Verify logged-in user
        const { data: authData, error: authError } =
            await db.auth.getUser();

        if (authError || !authData.user) {
            window.location.href = "index.html";
            return;
        }

        // Find school administrator membership
        const { data: memberships, error: membershipError } =
            await db
                .from("school_memberships")
                .select("school_id")
                .eq("user_id", authData.user.id)
                .eq("role", "school_admin");

        if (membershipError) throw membershipError;

        if (!memberships || memberships.length === 0) {
            throw new Error("No school administrator membership found.");
        }

        currentSchoolId = memberships[0].school_id;

        // Confirm school approval
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

// Load available classes
async function loadClasses() {
    const select = document.getElementById("classId");

    const { data, error } = await db
        .from("classes")
        .select("id, class_name, arm")
        .eq("school_id", currentSchoolId)
        .order("class_name");

    if (error) throw error;

    select.innerHTML = '<option value="">Select Class</option>';

    data.forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.class_name +
            (item.arm ? " - " + item.arm : "");

        select.appendChild(option);
    });
}

// Register student
document.getElementById("studentForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const message = document.getElementById("studentMessage");
        const button = this.querySelector("button[type='submit']");

        button.disabled = true;
        button.textContent = "Registering...";

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

            if (!student.admission_number) {
                throw new Error("Enter an admission number.");
            }

            // Insert student record
            const { data: newStudent, error: studentError } = await db
                .from("students")
                .insert(student)
                .select("id")
                .single();

            if (studentError) throw studentError;

            // Create class enrolment
            const { error: enrolmentError } = await db
                .from("student_enrollments")
                .insert({
                    school_id: currentSchoolId,
                    student_id: newStudent.id,
                    class_id: document.getElementById("classId").value,
                    academic_session:
                        document.getElementById("academicSession").value.trim(),
                    term: document.getElementById("term").value
                });

            if (enrolmentError) {
                throw new Error(
                    "Student was registered, but class enrolment failed: " +
                    enrolmentError.message
                );
            }

            message.textContent = "Student registered successfully!";
            message.style.color = "green";

            this.reset();

            await loadStudents();

        } catch (error) {
            console.error(error);
            message.textContent = error.message;
            message.style.color = "red";

        } finally {
            button.disabled = false;
            button.textContent = "Register Student";
        }
    }
);

// Load registered students
async function loadStudents() {
    const list = document.getElementById("studentList");

    const { data, error } = await db
        .from("students")
        .select(`
            id,
            admission_number,
            first_name,
            middle_name,
            last_name,
            gender
        `)
        .eq("school_id", currentSchoolId)
        .order("created_at", { ascending: false });

    if (error) throw error;

    registeredStudents = data || [];
    displayStudents(registeredStudents);
}

// Display students
function displayStudents(students) {
    const list = document.getElementById("studentList");

    list.innerHTML = "";

    if (students.length === 0) {
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

        const gender = document.createElement("td");
        gender.textContent = student.gender || "-";

        const classCell = document.createElement("td");
        classCell.textContent = "Registered";

        row.append(admission, name, gender, classCell);
        list.appendChild(row);
    });
}

// Search students
document.getElementById("studentSearch").addEventListener(
    "input",
    function() {
        const search = this.value.toLowerCase();

        const filtered = registeredStudents.filter(student => {
            const name = [
                student.first_name,
                student.middle_name,
                student.last_name
            ].filter(Boolean).join(" ").toLowerCase();

            return name.includes(search) ||
                student.admission_number.toLowerCase().includes(search);
        });

        displayStudents(filtered);
    }
);

initializeStudents();
