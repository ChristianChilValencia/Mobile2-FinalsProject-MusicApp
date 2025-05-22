// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  api: {
    deezer_url: 'https://deezerdevs-deezer.p.rapidapi.com/search',
    deezer_api_key: '22b38b0583msh6ca6120bebde3a8p1a434cjsnfea3a2d94f6d',
    deezer_api_host: 'deezerdevs-deezer.p.rapidapi.com'
  },
  storage_root_path: 'vibeflow_storage',
  playback_mode: 'local', // local or stream
  cache_policy: true
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
