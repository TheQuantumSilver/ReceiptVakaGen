// public/script.js

// --- Configuration ---
// In a real production app, you might get this from a build process
// For Vercel serverless, frontend JavaScript needs to know the API endpoint structure
const API_BASE_URL = window.location.origin; // Dynamically get the base URL of the current page

// --- Helper Functions ---

// Function to show a message on the UI (e.g., login success/failure, error messages)
function showMessage(elementId, message, isSuccess = false) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message; // Set the message text
        // Apply 'success' class for green messages, default for red/error messages
        element.className = isSuccess ? 'message success' : 'message';
        // Clear the message after 5 seconds
        setTimeout(() => {
            element.textContent = '';
            element.className = 'message'; // Reset class
        }, 5000);
    }
}

// Function to save the JWT token and admin name to the browser's localStorage
// localStorage keeps data even if the user closes the browser
function saveAuthData(token, adminName) {
    localStorage.setItem('jwtToken', token);
    localStorage.setItem('adminName', adminName);
}

// Function to retrieve the JWT token from localStorage
function getAuthToken() {
    return localStorage.getItem('jwtToken');
}

// Function to retrieve the admin name from localStorage
function getAdminName() {
    return localStorage.getItem('adminName');
}

// Function to clear all authentication data from localStorage (for logout)
function clearAuthData() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('adminName');
}

// Function to redirect the browser to the dashboard page
function redirectToDashboard() {
    window.location.href = '/dashboard.html';
}

// Function to redirect the browser to the login page
function redirectToLogin() {
    window.location.href = '/index.html';
}
// public/script.js (Continued)

// --- Login Page Logic (index.html) ---
// This code block runs only if the current page is the login page ('/' or '/index.html')
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    // Get references to the HTML elements on the login page
    const loginForm = document.getElementById('loginForm');
    const adminCodeInput = document.getElementById('adminCode');
    const loginMessage = document.getElementById('loginMessage');

    // First check: If a JWT token already exists in localStorage (meaning admin is already logged in),
    // then immediately redirect them to the dashboard. No need to log in again.
    if (getAuthToken()) {
        redirectToDashboard();
    }

    // If the login form exists on the page (it should on index.html)
    if (loginForm) {
        // Add an event listener to the form to handle its submission
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent the browser's default form submission (which would reload the page)

            const adminCode = adminCodeInput.value; // Get the admin code typed by the user
            loginMessage.textContent = 'Logging in...'; // Show a loading message
            loginMessage.className = 'message'; // Reset the message style (remove success/error class if any)

            try {
                // Send a POST request to our backend login API
                const response = await fetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST', // We are sending data
                    headers: {
                        'Content-Type': 'application/json', // Tell the server we're sending JSON
                    },
                    body: JSON.stringify({ adminCode }), // Convert the adminCode object into a JSON string
                });

                const data = await response.json(); // Parse the JSON response from the server

                if (response.ok) { // If the server responded with a successful status (200-299)
                    saveAuthData(data.token, data.adminName); // Save the received token and admin name
                    showMessage('loginMessage', `Welcome, ${data.adminName}! Redirecting...`, true); // Show success message
                    setTimeout(redirectToDashboard, 1500); // Wait 1.5 seconds, then go to the dashboard
                } else { // If the server responded with an error status (e.g., 400, 401, 500)
                    // Display the error message from the server, or a generic one if not provided
                    showMessage('loginMessage', data.message || 'Login failed. Please try again.');
                }
            } catch (error) {
                // Catch any network errors (e.g., server not running, no internet)
                console.error('Network or server error during login:', error);
                showMessage('loginMessage', 'Network error. Could not connect to the server.');
            }
        });
    }
}

// public/script.js (Continued)

// --- Dashboard Page Logic (dashboard.html) ---
// This code block runs only if the current page is the dashboard page ('/dashboard.html')
if (window.location.pathname === '/dashboard.html') {
    // Get references to all necessary HTML elements on the dashboard page
    const adminNameDisplay = document.getElementById('adminNameDisplay'); // Where admin's name is shown
    const logoutButton = document.getElementById('logoutButton');         // Logout button
    const searchBar = document.getElementById('searchBar');               // Search input field
    const searchButton = document.getElementById('searchButton');         // Search button
    const resultsTableBody = document.getElementById('resultsTableBody'); // Table body to display results

    // Modal elements (we'll set up their logic in the next chunk, but define variables here)
    const confirmationModal = document.getElementById('confirmationModal');
    const modalPetitionerName = document.getElementById('modalPetitionerName');
    const modalPetitionerNumber = document.getElementById('modalPetitionerNumber');
    const confirmPaymentButton = document.getElementById('confirmPaymentButton');
    const cancelPaymentButton = document.getElementById('cancelPaymentButton');
    const modalCloseButton = document.querySelector('.modal .close-button');
    const modalMessage = document.getElementById('modalMessage');

    // Variable to temporarily store the ID of the petitioner that the admin wants to confirm
    let currentPetitionerIdToConfirm = null;

    // --- Initial Dashboard Load Authentication Check ---
    const token = getAuthToken();   // Get the JWT token from localStorage
    const adminName = getAdminName(); // Get the admin's name from localStorage

    if (!token || !adminName) {
        // If no token or admin name is found, it means the admin is not logged in or session expired.
        // Redirect them back to the login page immediately.
        redirectToLogin();
    } else {
        // If logged in, display the admin's name on the dashboard.
        adminNameDisplay.textContent = adminName;
    }

    // --- Logout Functionality ---
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            clearAuthData();     // Remove the token and admin name from localStorage
            redirectToLogin();   // Send the user back to the login page
        });
    }

    // --- Search Functionality ---
    // Async function to handle fetching search results from the backend
    async function performSearch() {
        const query = searchBar.value.trim(); // Get text from search bar and remove extra spaces

        // Basic validation: Don't search if the query is too short
        if (query.length < 1) {
            resultsTableBody.innerHTML = '<tr><td colspan="7" class="no-results">Please enter at least one character to search.</td></tr>';
            return; // Stop the function if query is too short
        }

        try {
            // Send a GET request to our backend search API, including the search query and the JWT token
            const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`, // Crucial: Send the JWT token for authentication
                    'Content-Type': 'application/json',
                },
            });

            const data = await response.json(); // Parse the JSON response

            if (response.ok) { // If the search was successful
                displaySearchResults(data); // Call a function to display the results in the table
            } else if (response.status === 401 || response.status === 403) {
                // If token is invalid or expired (401 Unauthorized, 403 Forbidden)
                showMessage('adminNameDisplay', data.message || 'Session expired. Please log in again.'); // Show message near admin name
                setTimeout(redirectToLogin, 1500); // Redirect to login after a delay
            } else {
                // Other errors from the search API
                showMessage('adminNameDisplay', data.message || 'Error searching for petitioners.');
            }
        } catch (error) {
            // Catch network errors
            console.error('Network or server error during search:', error);
            showMessage('adminNameDisplay', 'Network error. Could not connect to the server.');
        }
    }

    // --- Event Listeners for Search ---
    if (searchButton) {
        searchButton.addEventListener('click', performSearch); // When search button is clicked
    }
    if (searchBar) {
        searchBar.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') { // When Enter key is pressed in the search bar
                performSearch();
            }
        });
    }

    // --- Function to Display Search Results (details in next chunk for clarity) ---
    // (The `displaySearchResults` function will be provided in the next chunk)

    // --- Modal Logic (functions and event listeners will be in the final chunk) ---

    // Initial search to load some data when dashboard loads (Optional)
    // For now, the dashboard will show the "Start typing..." message initially.
    // If you want to load all pending payments on load, you could call performSearch()
    // with an empty query here, BUT you would need to adjust performSearch()
    // to handle an empty query by fetching ALL (or all PENDING) records rather than requiring a search term.
    // Given the current performSearch(), it requires a query.
        // ... (Variables for elements and currentPetitionerIdToConfirm, etc., from previous chunk) ...
    // Make sure these are accessible:


    // (Include the performSearch function from the previous chunk here if combining,
    // or ensure it's in the same overall 'if (window.location.pathname === "/dashboard.html")' block)

    // Function to display search results in the HTML table
    function displaySearchResults(petitioners) {
        resultsTableBody.innerHTML = ''; // Clear any previously displayed results

        if (petitioners.length === 0) {
            // If no petitioners are found, display a "No results" message across the table
            resultsTableBody.innerHTML = '<tr><td colspan="7" class="no-results">No petitioners found for your search.</td></tr>';
            return; // Stop the function
        }

        // Loop through each petitioner object received from the backend
        petitioners.forEach(petitioner => {
            const row = document.createElement('tr'); // Create a new table row for each petitioner
            // If payment is confirmed, add the 'row-confirmed' CSS class to grey out the row
            if (petitioner.payment_confirmed) {
                row.classList.add('row-confirmed');
            }

            // Populate the row with petitioner data and the action button
            row.innerHTML = `
                <td>${petitioner.name}</td>
                <td>${petitioner.petitioner_number}</td>
                <td>${petitioner.petitioner_group}</td>
                <td>${petitioner.department}</td>
                <td>${petitioner.email}</td>
                <td>${petitioner.payment_confirmed ? 'Confirmed' : 'Pending'}</td>
                <td>
                    <button
                        class="${petitioner.payment_confirmed ? 'btn-disabled' : 'btn-confirm'}"
                        data-petitioner-id="${petitioner.id}"
                        ${petitioner.payment_confirmed ? 'disabled' : ''}
                    >
                        ${petitioner.payment_confirmed ? 'Confirmed' : 'Confirm Payment'}
                    </button>
                </td>
            `;
            resultsTableBody.appendChild(row); // Add the new row to the table body
        });

        // After all rows are added, attach event listeners to all newly created "Confirm Payment" buttons
        resultsTableBody.querySelectorAll('.btn-confirm').forEach(button => {
            button.addEventListener('click', (event) => {
                const id = event.target.dataset.petitionerId; // Get the petitioner's ID from the button's data attribute
                const row = event.target.closest('tr'); // Find the table row containing this button
                const name = row.children[0].textContent; // Get the petitioner's name from the first cell
                const number = row.children[1].textContent; // Get the petitioner's number from the second cell
                openConfirmationModal(id, name, number); // Open the modal with this petitioner's info
            });
        });
    }

    // --- Modal Logic ---

    // Function to show the confirmation modal
    function openConfirmationModal(id, name, number) {
        currentPetitionerIdToConfirm = id; // Store the ID globally so confirm button can access it
        modalPetitionerName.textContent = name; // Display petitioner's name in modal
        modalPetitionerNumber.textContent = number; // Display petitioner's number in modal
        modalMessage.textContent = ''; // Clear any old messages in the modal
        confirmationModal.style.display = 'flex'; // Make the modal visible (using flex for centering)
    }

    // Function to hide the confirmation modal
    function closeConfirmationModal() {
        confirmationModal.style.display = 'none'; // Hide the modal
        currentPetitionerIdToConfirm = null; // Clear the stored ID
    }

    // --- Event Listeners for Modal Buttons ---
    if (modalCloseButton) {
        modalCloseButton.addEventListener('click', closeConfirmationModal); // Close when 'x' is clicked
    }
    if (cancelPaymentButton) {
        cancelPaymentButton.addEventListener('click', closeConfirmationModal); // Close when 'Cancel' is clicked
    }
    // Close modal if user clicks anywhere outside the modal content
    window.addEventListener('click', (event) => {
        if (event.target === confirmationModal) {
            closeConfirmationModal();
        }
    });

    // --- Confirm Payment API Call from Modal ---
    if (confirmPaymentButton) {
        confirmPaymentButton.addEventListener('click', async () => {
            if (!currentPetitionerIdToConfirm) {
                showMessage('modalMessage', 'No petitioner selected for confirmation.', false);
                return;
            }

            modalMessage.textContent = 'Confirming payment...'; // Show a loading message in the modal
            modalMessage.className = 'message'; // Reset message styling

            try {
                // Send a POST request to our backend confirm API
                const response = await fetch(`${API_BASE_URL}/api/confirm`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`, // Crucial: Send the JWT token
                    },
                    body: JSON.stringify({ petitionerId: currentPetitionerIdToConfirm }), // Send the ID of the petitioner to confirm
                });

                const data = await response.json(); // Parse the JSON response

                if (response.status === 200) { // If confirmation was successful
                    showMessage('modalMessage', data.message, true); // Show success message
                    // After successful confirmation, immediately re-run the search
                    // This will refresh the table and show the newly confirmed row as greyed out
                    await performSearch();
                    setTimeout(closeConfirmationModal, 1500); // Close modal after success and a slight delay
                } else if (response.status === 401 || response.status === 403) {
                     // If session expired or invalid token during confirmation
                     showMessage('modalMessage', data.message || 'Session expired. Please log in again.');
                     setTimeout(redirectToLogin, 1500); // Redirect to login
                } else {
                    // Other errors from the confirm API (e.g., already confirmed, server error)
                    showMessage('modalMessage', data.message || 'Error confirming payment.');
                }
            } catch (error) {
                // Catch network errors
                console.error('Network or server error during confirmation:', error);
                showMessage('modalMessage', 'Network error. Could not connect to the server.');
            }
        });
    }

    // Initial load: The dashboard will initially show the "Start typing in the search bar..." message.
    // If you wanted to load all pending payments on page load, you would need to:
    // 1. Modify `performSearch` to handle an empty `query` by fetching all pending records.
    // 2. Call `performSearch()` here without an argument or with an empty string.
}