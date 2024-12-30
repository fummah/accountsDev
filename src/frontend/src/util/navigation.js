import { useHistory } from 'react-router-dom';

export const useRedirectToItem = () => {
    const history = useHistory();

    const redirectToItem = (id, type) => {
        history.push(`/detail/${type}/${id}`);
    };

    return redirectToItem;
};
