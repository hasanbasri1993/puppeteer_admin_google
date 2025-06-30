import { createStore } from 'vuex';

// Create the Vuex store
const store = createStore({
    state: {
        hostname: 'http://localhost:3000', // Define your global variable here,
        islogged: false,
    },
    mutations: {
        // Mutation to update the hostname
        setHostname(state, newHostname) {
            state.hostname = newHostname;
        },
        // Mutation to update the hostname
        setIsLogged(state, newIslogged) {
            state.islogged = newIslogged;
        },
    },
    actions: {
        // Action to update the hostname
        updateIslogged({ commit }, Islogged) {
            commit('setHostname', Islogged);
        },
        // Action to update the hostname
        updateIsLogged({ commit }, newIsLogged) {
            commit('setIsLogged', newIsLogged);
        },
    },
    getters: {
        // Getter to access the hostname
        hostname: (state) => state.hostname,
        islogged: (state) => state.islogged,
    },
});

export default store;