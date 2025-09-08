let elements;
let emailAddress = '';

async function initialize() {
    const response = await fetch("/create-checkout-session", {
        method: "POST",
    });
    const { clientSecret } = await response.json();

    const stripe = Stripe('pk_test_your_publishable_key');

    elements = stripe.elements({
        clientSecret,
        appearance: {
            theme: 'stripe',
            variables: {
                colorPrimary: '#635bff',
                colorBackground: '#ffffff',
                colorText: '#0a2540',
                colorDanger: '#df1b41',
                fontFamily: 'system-ui, sans-serif',
                spacingUnit: '4px',
                borderRadius: '8px',
            },
        },
    });

    const paymentElement = elements.create("payment");
    paymentElement.mount("#payment-element");
}

async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
            return_url: `${window.location.origin}/complete.html`,
            receipt_email: emailAddress,
        },
    });

    if (error) {
        const messageContainer = document.querySelector("#payment-message");
        messageContainer.textContent = error.message;
        messageContainer.classList.remove("hidden");
        setLoading(false);
        return;
    }
}

function setLoading(isLoading) {
    const submitButton = document.querySelector("#submit");
    const spinner = document.querySelector("#spinner");
    const buttonText = document.querySelector("#button-text");

    if (isLoading) {
        submitButton.disabled = true;
        spinner.classList.remove("hidden");
        buttonText.classList.add("hidden");
    } else {
        submitButton.disabled = false;
        spinner.classList.add("hidden");
        buttonText.classList.remove("hidden");
    }
}

async function checkStatus() {
    const clientSecret = new URLSearchParams(window.location.search).get(
        "payment_intent_client_secret"
    );

    if (!clientSecret) {
        return;
    }

    const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);

    switch (paymentIntent.status) {
        case "succeeded":
            showMessage("Payment succeeded!");
            break;
        case "processing":
            showMessage("Your payment is processing.");
            break;
        case "requires_payment_method":
            showMessage("Your payment was not successful, please try again.");
            break;
        default:
            showMessage("Something went wrong.");
            break;
    }
}

function showMessage(messageText) {
    const messageContainer = document.querySelector("#payment-message");
    messageContainer.classList.remove("hidden");
    messageContainer.textContent = messageText;
    
    if (messageText.includes("succeeded")) {
        messageContainer.classList.add("success");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initialize();
    document.querySelector("#submit").addEventListener("click", handleSubmit);
    checkStatus();
});
