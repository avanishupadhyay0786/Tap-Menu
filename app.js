import { auth, db } from "./firebase-config.js";

import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    getCountFromServer,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();

let currentUser = null;
let currentRestaurant = null;
let activeRestaurantId = null;

let restaurants = [];
let menuItems = [];
let restaurantRatings = [];

let selectedCity = "";
let selectedCategory = "All";
let searchQuery = "";
let userCoordinates = null;
let isRestaurantLogin = false;

const DEFAULT_CITIES = [
    "Lucknow",
    "Banda",
    "Atarra",
    "Kanpur",
    "Ayodhya",
    "Chitrakoot"
];

function $(selector) {
    return document.querySelector(selector);
}

function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value ?? "";
}

function showElement(element, show = true) {
    if (!element) return;
    element.hidden = !show;
    element.style.display = show ? "" : "none";
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return entities[character];
    });
}

function formatPrice(price) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(price) || 0);
}

function setMessage(selector, message, isError = false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#dc2626" : "#15803d";
}

function setButtonLoading(button, loading, loadingText = "Please wait...") {
    if (!button) return;

    if (loading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
        button.disabled = true;
        button.textContent = loadingText;
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

function getErrorMessage(error) {
    const messages = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/invalid-login-credentials": "Incorrect email or password.",
        "auth/user-not-found": "No account was found for this email.",
        "auth/wrong-password": "Incorrect email or password.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/too-many-requests": "Too many attempts. Please try again later.",
        "auth/network-request-failed": "Network error. Check your internet connection.",
        "auth/popup-closed-by-user": "The Google sign-in window was closed.",
        "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and try again.",
        "auth/unauthorized-domain": "This website domain is not authorised in Firebase.",
        "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase Authentication.",
        "auth/account-exists-with-different-credential": "An account already exists with another sign-in method.",
        "permission-denied": "Permission denied. Check your Firestore security rules.",
        "unavailable": "The service is temporarily unavailable. Try again."
    };

    return messages[error?.code] || error?.message || "Something went wrong. Please try again.";
}

function showCustomerWebsite() {
    showElement($("#customerWebsite"), true);
    showElement($("#restaurantLoginSection"), false);
    showElement($("#restaurantDashboard"), false);
    showElement($("#restaurantDetailPage"), false);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showRestaurantLogin() {
    showElement($("#customerWebsite"), false);
    showElement($("#restaurantDetailPage"), false);
    showElement($("#restaurantDashboard"), false);
    showElement($("#restaurantLoginSection"), true);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showRestaurantDashboard() {
    showElement($("#customerWebsite"), false);
    showElement($("#restaurantDetailPage"), false);
    showElement($("#restaurantLoginSection"), false);
    showElement($("#restaurantDashboard"), true);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showRestaurantDetailsPage() {
    showElement($("#customerWebsite"), false);
    showElement($("#restaurantLoginSection"), false);
    showElement($("#restaurantDashboard"), false);
    showElement($("#restaurantDetailPage"), true);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function getRestaurantForOwner(user) {
    if (!user) return null;

    try {
        const ownerQuery = query(
            collection(db, "restaurants"),
            where("ownerUid", "==", user.uid)
        );

        const ownerSnapshot = await getDocs(ownerQuery);

        if (ownerSnapshot.empty) {
            console.warn("No restaurant is linked to this Firebase UID:", user.uid);
            return null;
        }

        if (ownerSnapshot.size > 1) {
            console.warn("Multiple restaurants are linked to this account.");
        }

        const restaurantDocument = ownerSnapshot.docs[0];

        return {
            id: restaurantDocument.id,
            ...restaurantDocument.data()
        };
    } catch (error) {
        console.error("Restaurant lookup failed:", {
            code: error.code,
            message: error.message
        });
        throw error;
    }
}

$("#restaurantLoginButton")?.addEventListener("click", () => {
    isRestaurantLogin = true;
    showRestaurantLogin();
});

$("#partnerLoginButton")?.addEventListener("click", () => {
    isRestaurantLogin = true;
    showRestaurantLogin();
});

$("#backToWebsiteButton")?.addEventListener("click", () => {
    isRestaurantLogin = false;
    showCustomerWebsite();
});

$("#customerGoogleSignIn")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    setButtonLoading(button, true, "Signing in...");

    try {
        const result = await signInWithPopup(auth, googleProvider);

        currentUser = result.user;
        isRestaurantLogin = false;
        sessionStorage.removeItem("tapmenuRestaurantLogin");

        console.log("Google customer sign-in successful:", {
            uid: currentUser.uid,
            email: currentUser.email
        });

        showCustomerWebsite();

        alert(
            `Welcome${currentUser.displayName ? ", " + currentUser.displayName : ""}! You are signed in to TapMenu.`
        );
    } catch (error) {
        console.error("Google sign-in error:", {
            code: error.code,
            message: error.message
        });
        alert(getErrorMessage(error));
    } finally {
        setButtonLoading(button, false);
    }
});

$("#restaurantLoginForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const email = $("#restaurantId")?.value.trim() || "";
    const password = $("#restaurantPassword")?.value || "";

    if (!email || !password) {
        setMessage("#loginMessage", "Please enter your email and password.", true);
        return;
    }

    setButtonLoading(button, true, "Signing in...");
    setMessage("#loginMessage", "");

    try {
        isRestaurantLogin = true;

        const credential = await signInWithEmailAndPassword(auth, email, password);
        currentUser = credential.user;

        console.log("Restaurant authentication successful:", {
            uid: currentUser.uid,
            email: currentUser.email
        });

        const restaurant = await getRestaurantForOwner(currentUser);

        if (!restaurant) {
            isRestaurantLogin = false;
            currentRestaurant = null;
            activeRestaurantId = null;
            sessionStorage.removeItem("tapmenuRestaurantLogin");

            setMessage(
                "#loginMessage",
                "Your account is signed in, but no restaurant is linked to it. Check the restaurant's ownerUid in Firestore.",
                true
            );
            return;
        }

        currentRestaurant = restaurant;
        activeRestaurantId = restaurant.id;

        sessionStorage.setItem("tapmenuRestaurantLogin", "true");

        await openRestaurantDashboard();

        setMessage("#loginMessage", "Login successful.");
    } catch (error) {
        console.error("Restaurant login failed:", {
            code: error.code || "application/error",
            message: error.message
        });

        setMessage("#loginMessage", getErrorMessage(error), true);
    } finally {
        setButtonLoading(button, false);
    }
});

onAuthStateChanged(auth, async user => {
    currentUser = user;

    if (!user) {
        currentRestaurant = null;
        activeRestaurantId = null;
        isRestaurantLogin = false;
        sessionStorage.removeItem("tapmenuRestaurantLogin");
        return;
    }

    if (
        !isRestaurantLogin &&
        sessionStorage.getItem("tapmenuRestaurantLogin") !== "true"
    ) {
        return;
    }

    isRestaurantLogin = true;

    if (currentRestaurant && activeRestaurantId) {
        return;
    }

    try {
        const restaurant = await getRestaurantForOwner(user);

        if (!restaurant) {
            currentRestaurant = null;
            activeRestaurantId = null;
            isRestaurantLogin = false;
            sessionStorage.removeItem("tapmenuRestaurantLogin");

            console.warn("Authenticated user has no linked restaurant:", user.uid);
            return;
        }

        currentRestaurant = restaurant;
        activeRestaurantId = restaurant.id;

        await openRestaurantDashboard();
    } catch (error) {
        console.error("Authentication state check failed:", {
            code: error.code,
            message: error.message
        });

        setMessage("#loginMessage", getErrorMessage(error), true);
    }
});

$("#restaurantLogoutButton")?.addEventListener("click", async () => {
    try {
        await signOut(auth);

        currentUser = null;
        currentRestaurant = null;
        activeRestaurantId = null;
        menuItems = [];
        isRestaurantLogin = false;

        sessionStorage.removeItem("tapmenuRestaurantLogin");

        showCustomerWebsite();
        await loadPublishedRestaurants();
    } catch (error) {
        console.error("Logout error:", error);
        alert(getErrorMessage(error));
    }
});

async function openRestaurantDashboard() {
    if (!currentUser || !currentRestaurant || !activeRestaurantId) {
        showRestaurantLogin();
        return;
    }

    showRestaurantDashboard();

    setText(
        "#dashboardRestaurantName",
        currentRestaurant.name || currentUser.email || "Restaurant Dashboard"
    );

    await loadRestaurantProfile();
    await loadMenuItems();
    await loadQrScanCount();
    showDashboardTab("overview");
}

function showDashboardTab(tabName) {
    $all("[data-dashboard-panel]").forEach(panel => {
        panel.hidden = panel.dataset.dashboardPanel !== tabName;
    });

    $all("[data-dashboard-tab]").forEach(button => {
        button.classList.toggle("active", button.dataset.dashboardTab === tabName);
    });
}

$all("[data-dashboard-tab]").forEach(button => {
    button.addEventListener("click", () => {
        const tabName = button.dataset.dashboardTab;
        showDashboardTab(tabName);

        if (tabName === "qr-code") {
            renderRestaurantQrCode();
            loadQrScanCount();
        }
    });
});

async function renderRestaurantQrCode() {
    const canvas = $("#restaurantQrCanvas");
    const status = $("#restaurantQrStatus");
    const linkInput = $("#restaurantQrUrl");
    const copyButton = $("#copyRestaurantQrLinkButton");
    const downloadButton = $("#downloadRestaurantQrButton");

    if (!canvas || !activeRestaurantId || !currentRestaurant) return;

    const customerUrl = new URL(window.location.href);
    customerUrl.search = "";
    customerUrl.hash = "";
    customerUrl.searchParams.set("id", activeRestaurantId);
    customerUrl.searchParams.set("source", "qr");

    if (linkInput) linkInput.value = customerUrl.toString();

    const isPublished = currentRestaurant.published === true;
    const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

    if (!isPublished) {
        canvas.hidden = true;
        if (status) status.textContent = "Save and publish your restaurant profile before using its QR code.";
        if (copyButton) copyButton.disabled = true;
        if (downloadButton) downloadButton.disabled = true;
        return;
    }

    if (typeof window.QRCode?.toCanvas !== "function") {
        canvas.hidden = true;
        if (status) status.textContent = "The QR code generator did not load. Refresh the page and try again.";
        if (copyButton) copyButton.disabled = true;
        if (downloadButton) downloadButton.disabled = true;
        return;
    }

    try {
        await window.QRCode.toCanvas(canvas, customerUrl.toString(), {
            width: 240,
            margin: 2,
            errorCorrectionLevel: "M",
            color: {
                dark: "#111827",
                light: "#ffffff"
            }
        });

        canvas.hidden = false;
        if (copyButton) copyButton.disabled = false;
        if (downloadButton) downloadButton.disabled = false;
        if (status) {
            status.textContent = isLocalPreview
                ? "QR code ready for testing. Open the dashboard from your live website before printing it."
                : "QR code ready. Customers will open your public restaurant page.";
        }
    } catch (error) {
        console.error("Generate restaurant QR code error:", error);
        canvas.hidden = true;
        if (status) status.textContent = "Unable to generate the QR code. Please refresh and try again.";
    }
}

async function loadQrScanCount() {
    if (!activeRestaurantId) return;

    try {
        const scans = collection(db, "restaurants", activeRestaurantId, "qrScans");
        const snapshot = await getCountFromServer(scans);
        const count = snapshot.data().count || 0;

        setText("#qrScanCount", count.toLocaleString());
        setText(
            "#qrScanTotal",
            `${count.toLocaleString()} QR visit${count === 1 ? "" : "s"} recorded`
        );
    } catch (error) {
        console.error("Load QR visit count error:", error);
        setText("#qrScanCount", "—");
        setText("#qrScanTotal", "Unable to load QR visits. Check the Firestore rules.");
    }
}

async function recordQrVisit(restaurantId) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "qr") return;

    const storageKey = `tapmenuQrVisit:${restaurantId}`;
    try {
        if (sessionStorage.getItem(storageKey)) return;
    } catch (error) {
        console.warn("QR visit session storage is unavailable.", error);
    }

    try {
        await addDoc(
            collection(db, "restaurants", restaurantId, "qrScans"),
            {
                source: "qr",
                createdAt: serverTimestamp()
            }
        );

        try {
            sessionStorage.setItem(storageKey, "1");
        } catch (error) {
            console.warn("Could not save QR visit session marker.", error);
        }
    } catch (error) {
        console.error("Record QR visit error:", error);
    }
}

$("#copyRestaurantQrLinkButton")?.addEventListener("click", async () => {
    const linkInput = $("#restaurantQrUrl");
    if (!linkInput?.value) return;

    try {
        await navigator.clipboard.writeText(linkInput.value);
        setText("#restaurantQrStatus", "Customer link copied.");
    } catch (error) {
        linkInput.select();
        const copied = document.execCommand("copy");
        setText(
            "#restaurantQrStatus",
            copied ? "Customer link copied." : "Select and copy the customer link above."
        );
    }
});

$("#downloadRestaurantQrButton")?.addEventListener("click", () => {
    const canvas = $("#restaurantQrCanvas");
    if (!canvas || canvas.hidden) return;

    const safeName = (currentRestaurant?.name || "restaurant")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "restaurant";

    const downloadLink = document.createElement("a");
    downloadLink.href = canvas.toDataURL("image/png");
    downloadLink.download = `tapmenu-${safeName}-qr.png`;
    downloadLink.click();
});

$("#refreshQrScanCountButton")?.addEventListener("click", loadQrScanCount);

$all("[data-open-tab]").forEach(button => {
    button.addEventListener("click", () => {
        showDashboardTab(button.dataset.openTab);
    });
});

async function loadRestaurantProfile() {
    if (!currentRestaurant || !activeRestaurantId) return;

    try {
        const restaurantReference = doc(db, "restaurants", activeRestaurantId);
        const snapshot = await getDoc(restaurantReference);

        if (!snapshot.exists()) return;

        const data = snapshot.data();

        currentRestaurant = { id: snapshot.id, ...data };

        const fields = {
            "#profileRestaurantName": data.name,
            "#restaurantCategory": data.category,
            "#restaurantCity": data.city,
            "#restaurantAddress": data.address,
            "#restaurantDescription": data.description,
            "#restaurantPhone": data.phone,
            "#restaurantImageUrl": data.image
        };

        Object.entries(fields).forEach(([selector, value]) => {
            const element = $(selector);
            if (element && value != null) element.value = value;
        });

        setText(
            "#dashboardRestaurantName",
            data.name || currentUser.email || "Restaurant Dashboard"
        );

        setMessage("#profileMessage", "Restaurant profile loaded.");
    } catch (error) {
        console.error("Load restaurant profile error:", error);
        setMessage("#profileMessage", getErrorMessage(error), true);
    }
}

$("#restaurantProfileForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    if (!auth.currentUser || !activeRestaurantId) {
        setMessage(
            "#profileMessage",
            "Please sign in with your authorised restaurant account first.",
            true
        );
        return;
    }

    const user = auth.currentUser;

    const profile = {
        ownerUid: user.uid,
        name: $("#profileRestaurantName")?.value.trim() || "",
        category: $("#restaurantCategory")?.value || "",
        city: $("#restaurantCity")?.value || "",
        address: $("#restaurantAddress")?.value.trim() || "",
        description: $("#restaurantDescription")?.value.trim() || "",
        phone: $("#restaurantPhone")?.value.trim() || "",
        image: $("#restaurantImageUrl")?.value.trim() || "",
        updatedAt: serverTimestamp()
    };

    if (
        !profile.name ||
        !profile.category ||
        !profile.city ||
        !profile.address ||
        !profile.description
    ) {
        setMessage(
            "#profileMessage",
            "Please complete all required restaurant details.",
            true
        );
        return;
    }

    setButtonLoading(button, true, "Saving profile...");

    try {
        const restaurantReference = doc(
            db,
            "restaurants",
            activeRestaurantId
        );

        const snapshot = await getDoc(restaurantReference);

        if (!snapshot.exists()) {
            throw new Error(
                "Restaurant document not found. Check the restaurant ID."
            );
        }

        const existingData = snapshot.data();

        if (existingData.ownerUid !== user.uid) {
            throw new Error(
                "Your account does not own this restaurant. Check ownerUid in Firestore."
            );
        }

        await updateDoc(restaurantReference, profile);

        currentRestaurant = {
            ...existingData,
            ...profile,
            id: activeRestaurantId
        };

        setText("#dashboardRestaurantName", profile.name);

        setMessage(
            "#profileMessage",
            "Restaurant profile updated successfully!"
        );

        await loadPublishedRestaurants();

    } catch (error) {
        console.error("Restaurant profile update failed:", {
            code: error.code || "application/error",
            message: error.message
        });

        setMessage(
            "#profileMessage",
            error.code === "permission-denied"
                ? "Permission denied. Check your Firestore security rules and restaurant ownership."
                : error.message || "Unable to update restaurant profile.",
            true
        );

    } finally {
        setButtonLoading(button, false);
    }
});

$("#publishRestaurantButton")?.addEventListener("click", async event => {
    const button = event.currentTarget;

    if (!currentUser || !activeRestaurantId) {
        setMessage("#publishMessage", "Please sign in to your authorised restaurant account.", true);
        return;
    }

    setButtonLoading(button, true, "Publishing...");

    try {
        const restaurantReference = doc(db, "restaurants", activeRestaurantId);
        const snapshot = await getDoc(restaurantReference);

        if (!snapshot.exists()) {
            throw new Error("Save your restaurant profile before publishing.");
        }

        const data = snapshot.data();

        if (data.ownerUid !== currentUser.uid) {
            throw new Error("You are not authorised to publish this restaurant.");
        }

        if (!data.name || !data.category || !data.city || !data.address || !data.description) {
            throw new Error("Complete and save your restaurant profile before publishing.");
        }

        await updateDoc(restaurantReference, {
            published: true,
            updatedAt: serverTimestamp()
        });

        currentRestaurant = {
            ...data,
            id: snapshot.id,
            published: true
        };

        setMessage("#publishMessage", "Your restaurant is now published on TapMenu.");
        await loadPublishedRestaurants();
    } catch (error) {
        console.error("Publish restaurant error:", error);
        setMessage("#publishMessage", getErrorMessage(error), true);
    } finally {
        setButtonLoading(button, false);
    }
});

async function loadPublishedRestaurants() {
    const grid = $("#restaurantGrid");

    if (grid && restaurants.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span>🍽️</span>
                <h3>Loading restaurants...</h3>
                <p>Please wait while we find local restaurants.</p>
            </div>
        `;
    }

    try {
        const publishedQuery = query(
            collection(db, "restaurants"),
            where("published", "==", true)
        );

        const snapshot = await getDocs(publishedQuery);

        restaurants = snapshot.docs.map(restaurantDocument => ({
            id: restaurantDocument.id,
            ...restaurantDocument.data()
        }));

        renderRestaurants();

        const params = new URLSearchParams(window.location.search);

        if (params.get("id")) {
            await loadRestaurantFromURL();
        }
    } catch (error) {
        console.error("Load restaurants error:", error);

        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span>⚠️</span>
                    <h3>Unable to load restaurants</h3>
                    <p>${escapeHTML(getErrorMessage(error))}</p>
                </div>
            `;
        }
    }
}

function getVisibleRestaurants() {
    let results = [...restaurants];

    if (selectedCity) {
        results = results.filter(restaurant =>
            String(restaurant.city || "").toLowerCase() === selectedCity.toLowerCase()
        );
    }

    if (selectedCategory && selectedCategory !== "All") {
        results = results.filter(restaurant =>
            String(restaurant.category || "").toLowerCase() === selectedCategory.toLowerCase()
        );
    }

    if (searchQuery) {
        const term = searchQuery.toLowerCase();

        results = results.filter(restaurant => {
            const searchableText = [
                restaurant.name,
                restaurant.city,
                restaurant.category,
                restaurant.address,
                restaurant.description
            ].join(" ").toLowerCase();

            return searchableText.includes(term);
        });
    }

    const sortMode = $("#restaurantSort")?.value || "recommended";

    if (sortMode === "name") {
        results.sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""))
        );
    }

    if (sortMode === "distance" && userCoordinates) {
        results.sort((a, b) => {
            const distanceA = calculateDistance(
                userCoordinates.latitude,
                userCoordinates.longitude,
                Number(a.latitude ?? a.lat),
                Number(a.longitude ?? a.lng ?? a.lon)
            );

            const distanceB = calculateDistance(
                userCoordinates.latitude,
                userCoordinates.longitude,
                Number(b.latitude ?? b.lat),
                Number(b.longitude ?? b.lng ?? b.lon)
            );

            return distanceA - distanceB;
        });
    }

    return results;
}

function renderRestaurants() {
    const grid = $("#restaurantGrid");
    if (!grid) return;

    const visibleRestaurants = getVisibleRestaurants();

    setText(
        "#restaurantResultCount",
        `${visibleRestaurants.length} restaurant${visibleRestaurants.length === 1 ? "" : "s"} found`
    );

    setText(
        "#restaurantSectionTitle",
        selectedCity ? `Restaurants in ${selectedCity}` : "Popular restaurants"
    );

    if (visibleRestaurants.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span>🍽️</span>
                <h3>No restaurants found</h3>
                <p>Try another city, category or search term.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = visibleRestaurants.map(restaurant => {
        const name = escapeHTML(restaurant.name || "Restaurant");
        const city = escapeHTML(restaurant.city || "");
        const category = escapeHTML(restaurant.category || "Restaurant");
        const description = escapeHTML(
            restaurant.description || "Discover this restaurant on TapMenu."
        );

        const image = isSafeImageURL(restaurant.image)
            ? escapeHTML(restaurant.image)
            : "";

        return `
            <article class="restaurant-card">
                <div class="restaurant-card-image">
                    ${
                        image
                            ? `<img src="${image}" alt="${name}" loading="lazy">`
                            : `<div class="restaurant-image-placeholder">🍽️</div>`
                    }
                </div>
                <div class="restaurant-card-content">
                    <p class="restaurant-category">${category}</p>
                    <h3>${name}</h3>
                    <p class="restaurant-location">📍 ${city}</p>
                    <p class="restaurant-description">${description}</p>
                    <button
                        type="button"
                        class="primary-button view-menu-button"
                        data-restaurant-id="${escapeHTML(restaurant.id)}">
                        View Menu
                    </button>
                </div>
            </article>
        `;
    }).join("");

    $all(".view-menu-button").forEach(button => {
        button.addEventListener("click", () => {
            const restaurant = restaurants.find(item => item.id === button.dataset.restaurantId);
            if (restaurant) openRestaurantPage(restaurant);
        });
    });
}

$all("[data-city]").forEach(button => {
    button.addEventListener("click", event => {
        event.preventDefault();
        selectedCity = button.dataset.city || "";

        const citySelect = $("#citySearch");
        if (citySelect) citySelect.value = selectedCity;

        renderRestaurants();

        $("#restaurants")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });
});

$("#citySearch")?.addEventListener("change", event => {
    selectedCity = event.target.value || "";
    renderRestaurants();
});

$("#restaurantSearch")?.addEventListener("input", event => {
    searchQuery = event.target.value.trim();
    renderRestaurants();
});

$("#restaurantSearchForm")?.addEventListener("submit", event => {
    event.preventDefault();

    selectedCity = $("#citySearch")?.value || "";
    searchQuery = $("#restaurantSearch")?.value.trim() || "";

    renderRestaurants();

    $("#restaurants")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});

$all("[data-category]").forEach(button => {
    button.addEventListener("click", () => {
        selectedCategory = button.dataset.category || "All";

        $all("[data-category]").forEach(item => {
            item.classList.toggle("active", item === button);
        });

        renderRestaurants();
    });
});

$("#restaurantSort")?.addEventListener("change", renderRestaurants);

function isSafeImageURL(value) {
    if (!value) return false;

    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function createRestaurantSlug(name) {
    return String(name || "restaurant")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function openRestaurantPage(restaurant) {
    const params = new URLSearchParams();
    params.set("restaurant", createRestaurantSlug(restaurant.name));
    params.set("id", restaurant.id);

    history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);

    await renderRestaurantDetailPage(restaurant);
}

async function loadRestaurantFromURL() {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get("id");

    if (!restaurantId) {
        showElement($("#restaurantDetailPage"), false);
        return;
    }

    let restaurant = restaurants.find(item => item.id === restaurantId);

    if (!restaurant) {
        try {
            const snapshot = await getDoc(doc(db, "restaurants", restaurantId));

            if (snapshot.exists() && snapshot.data().published === true) {
                restaurant = {
                    id: snapshot.id,
                    ...snapshot.data()
                };
            }
        } catch (error) {
            console.error("Load restaurant detail error:", error);
        }
    }

    if (!restaurant) {
        showCustomerWebsite();
        return;
    }

    await renderRestaurantDetailPage(restaurant);
    await recordQrVisit(restaurant.id);
}

async function renderRestaurantDetailPage(restaurant) {
    const content = $("#restaurantDetailContent");
    if (!content) return;

    showRestaurantDetailsPage();

    const name = escapeHTML(restaurant.name || "Restaurant");
    const city = escapeHTML(restaurant.city || "");
    const category = escapeHTML(restaurant.category || "");
    const address = escapeHTML(restaurant.address || "");
    const description = escapeHTML(restaurant.description || "Welcome to our restaurant.");

    const image = isSafeImageURL(restaurant.image) ? escapeHTML(restaurant.image) : "";

    const directionsAddress = encodeURIComponent(
        `${restaurant.name || ""}, ${restaurant.address || ""}, ${restaurant.city || ""}`
    );

    content.innerHTML = `
        <div class="restaurant-detail-header">
            ${
                image
                    ? `<img class="restaurant-detail-image" src="${image}" alt="${name}">`
                    : `<div class="restaurant-detail-image restaurant-image-placeholder">🍽️</div>`
            }
            <div class="restaurant-detail-info">
                <p class="eyebrow">${category}</p>
                <h1>${name}</h1>
                <p>📍 ${city}</p>
                <p>${description}</p>
                <p>${address}</p>
                ${
                    restaurant.phone
                        ? `<p>☎️ ${escapeHTML(restaurant.phone)}</p>`
                        : ""
                }
                <a
                    class="primary-button"
                    href="https://www.google.com/maps/dir/?api=1&destination=${directionsAddress}"
                    target="_blank"
                    rel="noopener noreferrer">
                    Get Directions
                </a>
            </div>
        </div>
        <section class="restaurant-detail-menu">
            <h2>Our Menu</h2>
            <div id="detailMenuList"><p>Loading menu...</p></div>
        </section>
        <section class="restaurant-detail-ratings">
            <h2>Customer Ratings</h2>
            <div id="restaurantRatingsList"><p>Loading ratings...</p></div>
            <form id="restaurantRatingForm">
                <h3>Rate this restaurant</h3>
                <label for="restaurantRating">Your rating</label>
                <select id="restaurantRating" required>
                    <option value="">Choose rating</option>
                    <option value="5">⭐⭐⭐⭐⭐ - Excellent</option>
                    <option value="4">⭐⭐⭐⭐ - Very good</option>
                    <option value="3">⭐⭐⭐ - Good</option>
                    <option value="2">⭐⭐ - Fair</option>
                    <option value="1">⭐ - Poor</option>
                </select>
                <label for="restaurantReview">Your review (optional)</label>
                <textarea
                    id="restaurantReview"
                    maxlength="1000"
                    placeholder="Share your experience"></textarea>
                <button type="submit" class="primary-button">Submit Rating</button>
                <p id="ratingMessage" role="status"></p>
            </form>
        </section>
    `;

    await loadRestaurantMenu(restaurant.id);
    await loadRestaurantRatings(restaurant.id);
    attachRestaurantRatingHandler(restaurant.id);
}

async function loadRestaurantMenu(restaurantId) {
    const menuContainer = $("#detailMenuList");
    if (!menuContainer) return;

    try {
        const snapshot = await getDocs(collection(db, "restaurants", restaurantId, "menu"));

        const items = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .filter(item => item.available !== false);

        if (items.length === 0) {
            menuContainer.innerHTML = "<p>No menu items have been added yet.</p>";
            return;
        }

        menuContainer.innerHTML = items.map(item => {
            const name = escapeHTML(item.name || "Menu item");
            const description = escapeHTML(item.description || "");
            const image = isSafeImageURL(item.image) ? escapeHTML(item.image) : "";

            return `
                <article class="menu-item-card">
                    ${image ? `<img src="${image}" alt="${name}" loading="lazy">` : ""}
                    <div class="menu-item-info">
                        <h3>${name}</h3>
                        <p>${description}</p>
                        <strong>${formatPrice(item.price)}</strong>
                    </div>
                </article>
            `;
        }).join("");
    } catch (error) {
        console.error("Load public menu error:", error);
        menuContainer.innerHTML = "<p>Unable to load the menu. Please try again later.</p>";
    }
}

async function loadRestaurantRatings(restaurantId) {
    const container = $("#restaurantRatingsList");
    if (!container) return;

    try {
        const snapshot = await getDocs(collection(db, "restaurants", restaurantId, "ratings"));

        restaurantRatings = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        if (restaurantRatings.length === 0) {
            container.innerHTML = "<p>No ratings yet. Be the first to rate!</p>";
            return;
        }

        const average = restaurantRatings.reduce(
            (total, rating) => total + Number(rating.rating || 0),
            0
        ) / restaurantRatings.length;

        container.innerHTML = `
            <p>
                <strong>${average.toFixed(1)} / 5</strong>
                (${restaurantRatings.length} rating${restaurantRatings.length === 1 ? "" : "s"})
            </p>
            ${restaurantRatings.map(rating => `
                <article class="rating-card">
                    <strong>${"⭐".repeat(Math.max(0, Math.min(5, Number(rating.rating) || 0)))}</strong>
                    <p>${escapeHTML(rating.review || "No written review.")}</p>
                </article>
            `).join("")}
        `;
    } catch (error) {
        console.error("Load ratings error:", error);
        container.innerHTML = "<p>Unable to load customer ratings.</p>";
    }
}

function attachRestaurantRatingHandler(restaurantId) {
    const form = $("#restaurantRatingForm");
    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const user = auth.currentUser;

        if (!user) {
            setMessage("#ratingMessage", "Please sign in with Google before submitting a rating.", true);
            return;
        }

        const ratingValue = Number($("#restaurantRating")?.value);
        const review = $("#restaurantReview")?.value.trim() || "";

        if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
            setMessage("#ratingMessage", "Please select a rating from 1 to 5.", true);
            return;
        }

        const button = form.querySelector('button[type="submit"]');
        setButtonLoading(button, true, "Submitting...");

        try {
            const ratingReference = doc(
                db,
                "restaurants",
                restaurantId,
                "ratings",
                user.uid
            );

            await setDoc(ratingReference, {
                userUid: user.uid,
                userName: user.displayName || "TapMenu Customer",
                rating: ratingValue,
                review,
                updatedAt: serverTimestamp()
            });

            setMessage("#ratingMessage", "Thank you! Your rating has been submitted.");
            await loadRestaurantRatings(restaurantId);
        } catch (error) {
            console.error("Submit rating error:", error);
            setMessage("#ratingMessage", getErrorMessage(error), true);
        } finally {
            setButtonLoading(button, false);
        }
    });
}

$("#backToRestaurantsButton")?.addEventListener("click", () => {
    history.pushState({}, "", window.location.pathname);
    showCustomerWebsite();
    renderRestaurants();
});

window.addEventListener("popstate", async () => {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get("id");

    if (restaurantId) {
        await loadRestaurantFromURL();
    } else {
        showCustomerWebsite();
        renderRestaurants();
    }
});

async function loadMenuItems() {
    if (!activeRestaurantId) return;

    try {
        const snapshot = await getDocs(
            collection(db, "restaurants", activeRestaurantId, "menu")
        );

        menuItems = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        renderMenuItems();
    } catch (error) {
        console.error("Load dashboard menu error:", error);
        setMessage("#menuMessage", getErrorMessage(error), true);
    }
}

function renderMenuItems() {
    const container = $("#menuItemList");
    setText("#menuItemCount", menuItems.length);

    if (!container) return;

    if (menuItems.length === 0) {
        container.innerHTML = "<p>No menu items added yet.</p>";
        return;
    }

    container.innerHTML = menuItems.map(item => `
        <article class="dashboard-menu-item">
            <div>
                <h3>${escapeHTML(item.name || "Menu item")}</h3>
                <p>${escapeHTML(item.description || "")}</p>
                <strong>${formatPrice(item.price)}</strong>
                <p>Status: ${item.available === false ? "Unavailable" : "Available"}</p>
            </div>
            <button
                type="button"
                class="delete-menu-item-button"
                data-item-id="${escapeHTML(item.id)}">
                Delete
            </button>
        </article>
    `).join("");

    $all(".delete-menu-item-button").forEach(button => {
        button.addEventListener("click", async () => {
            await deleteMenuItem(button.dataset.itemId);
        });
    });
}

$("#menuItemForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser || !activeRestaurantId) {
        setMessage("#menuMessage", "Please sign in with your authorised restaurant account.", true);
        return;
    }

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const name = $("#dishName")?.value.trim() || "";
    const price = Number($("#dishPrice")?.value);
    const description = $("#dishDescription")?.value.trim() || "";
    const category = $("#dishCategory")?.value || "";
    const image = $("#dishImageUrl")?.value.trim() || "";
    const available = form.querySelector('[name="available"]')?.checked ?? true;

    if (!name || !category || !Number.isFinite(price) || price < 0) {
        setMessage("#menuMessage", "Enter a dish name, valid price and category.", true);
        return;
    }

    if (image && !isSafeImageURL(image)) {
        setMessage("#menuMessage", "Enter a valid image URL beginning with http:// or https://.", true);
        return;
    }

    setButtonLoading(button, true, "Adding dish...");

    try {
        await addDoc(
            collection(db, "restaurants", activeRestaurantId, "menu"),
            {
                name,
                price,
                description,
                category,
                image,
                available,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }
        );

        form.reset();

        const availableCheckbox = form.querySelector('[name="available"]');
        if (availableCheckbox) availableCheckbox.checked = true;

        setMessage("#menuMessage", "Menu item added successfully.");
        await loadMenuItems();
    } catch (error) {
        console.error("Add menu item error:", error);
        setMessage("#menuMessage", getErrorMessage(error), true);
    } finally {
        setButtonLoading(button, false);
    }
});

async function deleteMenuItem(itemId) {
    if (!currentUser || !activeRestaurantId || !itemId) return;

    if (!confirm("Are you sure you want to delete this menu item?")) return;

    try {
        await deleteDoc(doc(db, "restaurants", activeRestaurantId, "menu", itemId));
        setMessage("#menuMessage", "Menu item deleted successfully.");
        await loadMenuItems();
    } catch (error) {
        console.error("Delete menu item error:", error);
        setMessage("#menuMessage", getErrorMessage(error), true);
    }
}

$("#locationButton")?.addEventListener("click", () => {
    const status = $("#locationStatus");
    const button = $("#locationButton");

    if (!navigator.geolocation) {
        if (status) status.textContent = "Your browser does not support location services.";
        return;
    }

    if (status) status.textContent = "📍 Finding your location...";
    if (button) button.disabled = true;

    navigator.geolocation.getCurrentPosition(
        position => {
            userCoordinates = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            const restaurantsWithDistance = restaurants
                .map(restaurant => {
                    const latitude = Number(restaurant.latitude ?? restaurant.lat);
                    const longitude = Number(restaurant.longitude ?? restaurant.lng ?? restaurant.lon);

                    if (
                        !Number.isFinite(latitude) ||
                        !Number.isFinite(longitude) ||
                        latitude < -90 ||
                        latitude > 90 ||
                        longitude < -180 ||
                        longitude > 180
                    ) {
                        return null;
                    }

                    return {
                        ...restaurant,
                        distance: calculateDistance(
                            userCoordinates.latitude,
                            userCoordinates.longitude,
                            latitude,
                            longitude
                        )
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.distance - b.distance);

            if (button) button.disabled = false;

            if (restaurantsWithDistance.length === 0) {
                if (status) {
                    status.textContent = "Your location was found, but restaurants have no saved coordinates. Add latitude and longitude to their Firestore records.";
                }
                return;
            }

            selectedCity = "";
            selectedCategory = "All";
            searchQuery = "";

            if ($("#citySearch")) $("#citySearch").value = "";
            if ($("#restaurantSearch")) $("#restaurantSearch").value = "";
            if ($("#restaurantSort")) $("#restaurantSort").value = "distance";

            const grid = $("#restaurantGrid");

            if (grid) {
                grid.innerHTML = restaurantsWithDistance.map(restaurant => {
                    const name = escapeHTML(restaurant.name || "Restaurant");
                    const city = escapeHTML(restaurant.city || "");
                    const category = escapeHTML(restaurant.category || "Restaurant");

                    const image = isSafeImageURL(restaurant.image)
                        ? escapeHTML(restaurant.image)
                        : "";

                    return `
                        <article class="restaurant-card">
                            <div class="restaurant-card-image">
                                ${
                                    image
                                        ? `<img src="${image}" alt="${name}" loading="lazy">`
                                        : `<div class="restaurant-image-placeholder">🍽️</div>`
                                }
                            </div>
                            <div class="restaurant-card-content">
                                <p class="restaurant-category">${category}</p>
                                <h3>${name}</h3>
                                <p class="restaurant-location">📍 ${city}</p>
                                <p class="restaurant-distance">📏 ${restaurant.distance.toFixed(1)} km away</p>
                                <button
                                    type="button"
                                    class="primary-button view-menu-button"
                                    data-restaurant-id="${escapeHTML(restaurant.id)}">
                                    View Menu
                                </button>
                            </div>
                        </article>
                    `;
                }).join("");

                grid.querySelectorAll(".view-menu-button").forEach(menuButton => {
                    menuButton.addEventListener("click", () => {
                        const restaurant = restaurants.find(
                            item => item.id === menuButton.dataset.restaurantId
                        );
                        if (restaurant) openRestaurantPage(restaurant);
                    });
                });
            }

            setText("#restaurantSectionTitle", "Restaurants Near You");
            setText(
                "#restaurantResultCount",
                `${restaurantsWithDistance.length} restaurants sorted by distance`
            );

            if (status) {
                status.textContent = `📍 Location found! Showing ${restaurantsWithDistance.length} restaurants nearest to you.`;
            }

            $("#restaurants")?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        },
        error => {
            console.error("Location error:", error);
            if (button) button.disabled = false;
            if (!status) return;

            if (error.code === error.PERMISSION_DENIED) {
                status.textContent = "Location permission denied. Allow location access in your browser settings.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                status.textContent = "Your location is unavailable. Check your device location settings.";
            } else if (error.code === error.TIMEOUT) {
                status.textContent = "Location request timed out. Please try again.";
            } else {
                status.textContent = "Unable to determine your location. Please try again.";
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60000
        }
    );
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    if (
        !Number.isFinite(lat1) ||
        !Number.isFinite(lon1) ||
        !Number.isFinite(lat2) ||
        !Number.isFinite(lon2)
    ) {
        return Number.POSITIVE_INFINITY;
    }

    const toRadians = degrees => degrees * Math.PI / 180;
    const earthRadiusKm = 6371;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
}

$("#saveRewardSettings")?.addEventListener("click", () => {
    const threshold = $("#rewardThreshold")?.value || "5";
    const description = $("#rewardDescription")?.value.trim() || "";

    if (!currentUser || !activeRestaurantId) {
        setMessage("#rewardSettingsMessage", "Please sign in to your restaurant account first.", true);
        return;
    }

    setMessage(
        "#rewardSettingsMessage",
        `Reward settings selected: ${threshold} visits. Save functionality requires a configured loyalty settings document.`
    );
});

async function initialiseTapMenu() {
    setText("#currentYear", new Date().getFullYear());

    showElement($("#restaurantLoginSection"), false);
    showElement($("#restaurantDashboard"), false);

    const params = new URLSearchParams(window.location.search);

    if (params.get("id")) {
        showElement($("#customerWebsite"), false);
        showElement($("#restaurantDetailPage"), true);
    } else {
        showElement($("#customerWebsite"), true);
        showElement($("#restaurantDetailPage"), false);
    }

    await loadPublishedRestaurants();

    console.log("TapMenu initialised successfully.");
}

initialiseTapMenu().catch(error => {
    console.error("TapMenu initialisation error:", error);
});
