import {html, PolymerElement} from '@polymer/polymer/polymer-element.js';
import '@polymer/iron-icon/iron-icon.js';
import '@polymer/paper-button/paper-button.js';
import css from './logout-button.css';

/**
 * Logout button component.
 * Handles post-click redirection for account settings and logout.
 */
export class LogoutButton extends PolymerElement {
    static get properties() {
        return {
            logoutUrl: {type: String, value: '/logout'},
            accountBaseUrl: {type: String, value: ''},
        };
    }

    static get template() {
        return html([`
            <style>${css.toString()}</style>
            <div class="buttons">
                <a href$="[[accountBaseUrl]]" on-tap="openAccountSettings"
                   hidden$="[[!accountBaseUrl]]">
                    <paper-button id="account-button">
                        <iron-icon icon="account-circle"
                            title="Account Settings"></iron-icon>
                    </paper-button>
                </a>
                <a href$="[[logoutUrl]]" on-tap="logout">
                    <paper-button id="logout-button">
                        <iron-icon icon="kubeflow:logout"
                            title="Logout"></iron-icon>
                    </paper-button>
                </a>
            </div>
        `]);
    }

    /**
     * Redirect user to account settings URL.
     * @param {Event} event tap event
     */
    openAccountSettings(event) {
        if (event) {
            event.preventDefault();
        }
        if (this.accountBaseUrl) {
            window.top.location.href = this.accountBaseUrl;
        }
    }

    /**
     * Set current page to logoutURL.
     * @param {Event} event tap event
     */
    logout(event) {
        if (event) {
            event.preventDefault();
        }
        window.top.location.href = this.logoutUrl;
    }
}

customElements.define('logout-button', LogoutButton);
