/*global WildRydes _config*/

var WildRydes = window.WildRydes || {};
WildRydes.map = WildRydes.map || {};

// New: Handle Cognito OAuth2 code exchange and token storage
(function handleAuthCode() {
    var urlParams = new URLSearchParams(window.location.search);
    var code = urlParams.get('code');

    if (code) {
        // Prepare POST data for token exchange
        var data = new URLSearchParams();
        data.append('grant_type', 'authorization_code');
        data.append('client_id', _config.cognito.clientId);
        data.append('code', code);
        data.append('redirect_uri', _config.cognito.redirectUri);

        fetch('https://us-east-2mocbbb1jn.auth.us-east-2.amazoncognito.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: data.toString()
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Token exchange HTTP error: ' + response.status);
            }
            return response.json();
        })
        .then(tokens => {
            if (tokens.id_token) {
                // Save id_token to localStorage
                localStorage.setItem('id_token', tokens.id_token);

                // Remove the code param from the URL for cleanliness
                window.history.replaceState({}, document.title, '/ride.html');

                // Optionally reload the page or update UI
                window.location.reload();
            } else {
                console.error('Token response missing id_token:', tokens);
                alert('Login failed: no token received.');
            }
        })
        .catch(error => {
            console.error('Error during token exchange:', error);
            alert('Error exchanging authorization code. Check console.');
        });
    }
})();

// Setup WildRydes.authToken promise to return stored token
WildRydes.authToken = new Promise(function(resolve, reject) {
    var token = localStorage.getItem('id_token');
    if (token) {
        resolve(token);
    } else {
        reject('No auth token found');
    }
});

(function rideScopeWrapper($) {
    var authToken;

    WildRydes.authToken
      .then(function setAuthToken(token) {
        authToken = token || null;
      })
      .catch(function handleTokenError(error) {
        console.warn('Auth token error (ignored):', error);
        authToken = null;
      });

    function requestUnicorn(pickupLocation) {
        $.ajax({
            method: 'POST',
            url: _config.api.invokeUrl + '/ride',
            headers: {
                Authorization: authToken
            },
            data: JSON.stringify({
                PickupLocation: {
                    Latitude: pickupLocation.latitude,
                    Longitude: pickupLocation.longitude
                }
            }),
            contentType: 'application/json',
            success: completeRequest,
            error: function ajaxError(jqXHR, textStatus, errorThrown) {
                console.error('Error requesting ride: ', textStatus, ', Details: ', errorThrown);
                console.error('Response: ', jqXHR.responseText);
                alert('An error occurred when requesting your unicorn:\n' + jqXHR.responseText);
            }
        });
    }

    function completeRequest(result) {
        var unicorn = result.Unicorn;
        var pronoun = unicorn.Gender === 'Male' ? 'his' : 'her';
        console.log('Response received from API: ', result);

        displayUpdate(unicorn.Name + ', your ' + unicorn.Color + ' unicorn, is on ' + pronoun + ' way.');
        animateArrival(function animateCallback() {
            displayUpdate(unicorn.Name + ' has arrived. Giddy up!');
            WildRydes.map.unsetLocation();
            $('#request').prop('disabled', true).text('Set Pickup');
        });
    }

    $(function onDocReady() {
        $('#request').click(handleRequestClick);
        $('#signOut').click(function() {
            // Sign out clears stored token and reloads page
            localStorage.removeItem('id_token');
            WildRydes.signOut();
            alert("You have been signed out.");
            location.reload();
        });
        $(WildRydes.map).on('pickupChange', handlePickupChanged);

        WildRydes.authToken.then(function updateAuthMessage(token) {
            if (token) {
                displayUpdate('You are authenticated. Click to see your <a href="#authTokenModal" data-toggle="modal">auth token</a>.');
                $('.authToken').text(token);
            }
        });

        if (!_config.api.invokeUrl) {
            $('#noApiMessage').show();
        }
        $('#main').show();
    });

    function handlePickupChanged() {
        $('#request').text('Request Unicorn').prop('disabled', false);
    }

    function handleRequestClick(event) {
        event.preventDefault();
        requestUnicorn(WildRydes.map.selectedPoint);
    }

    function animateArrival(callback) {
        var dest = WildRydes.map.selectedPoint;
        var origin = {};

        origin.latitude = (dest.latitude > WildRydes.map.center.latitude)
            ? WildRydes.map.extent.minLat
            : WildRydes.map.extent.maxLat;

        origin.longitude = (dest.longitude > WildRydes.map.center.longitude)
            ? WildRydes.map.extent.minLng
            : WildRydes.map.extent.maxLng;

        WildRydes.map.animate(origin, dest, callback);
    }

    function displayUpdate(text) {
        $('#updates').append($('<li>' + text + '</li>'));
    }
}(jQuery));
